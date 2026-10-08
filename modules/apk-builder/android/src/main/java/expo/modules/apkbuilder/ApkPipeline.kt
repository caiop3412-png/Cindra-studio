package expo.modules.apkbuilder

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.android.apksig.ApkSigner
import com.android.tools.r8.CompilationFailedException
import com.android.tools.r8.CompilationMode
import com.android.tools.r8.D8
import com.android.tools.r8.D8Command
import com.android.tools.r8.Diagnostic
import com.android.tools.r8.DiagnosticsHandler
import com.android.tools.r8.OutputMode
import org.eclipse.jdt.internal.compiler.batch.Main as EcjMain
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.FilterOutputStream
import java.io.OutputStream
import java.io.PrintWriter
import java.io.StringWriter
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.util.Date
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream
import javax.security.auth.x500.X500Principal

data class ErroCompilacao(val arquivo: String, val linha: Int, val mensagem: String)

data class ResultadoBuild(
  val ok: Boolean,
  val apk: String?,
  val erros: List<ErroCompilacao>,
  val etapa: String
) {
  fun paraMapa(): Map<String, Any?> = mapOf(
    "ok" to ok,
    "apk" to apk,
    "etapa" to etapa,
    "erros" to erros.map {
      mapOf("arquivo" to it.arquivo, "linha" to it.linha, "mensagem" to it.mensagem)
    }
  )
}

/**
 * Projeto esperado em <pasta>/app/src/main/{AndroidManifest.xml, java, res, assets}
 * (é o que o CindraStudio grava em disco).
 */
class ApkPipeline(private val ctx: Context, private val log: (String) -> Unit) {

  fun compilar(projeto: File, androidJar: File, saida: File): ResultadoBuild {
    val erros = mutableListOf<ErroCompilacao>()
    fun falha(etapa: String) = ResultadoBuild(false, null, erros, etapa)

    try {
      val src = File(projeto, "app/src/main")
      val manifest = File(src, "AndroidManifest.xml")
      if (!manifest.exists()) {
        erros += ErroCompilacao("AndroidManifest.xml", 0, "AndroidManifest.xml não encontrado")
        return falha("preparo")
      }
      if (!androidJar.exists()) {
        erros += ErroCompilacao("android.jar", 0, "android.jar não encontrado")
        return falha("preparo")
      }
      val aapt2 = File(ctx.applicationInfo.nativeLibraryDir, "libaapt2.so")
      if (!aapt2.exists()) {
        erros += ErroCompilacao(
          "aapt2", 0,
          "libaapt2.so não está no app. Confira jniLibs/arm64-v8a e useLegacyPackaging (veja o LEIAME)."
        )
        return falha("preparo")
      }

      val minSdk = Regex("""minSdkVersion\s*=\s*"(\d+)"""")
        .find(manifest.readText())?.groupValues?.get(1)?.toInt() ?: 21

      val trabalho = File(projeto, ".build")
      trabalho.deleteRecursively()
      val compiladoRes = File(trabalho, "res.zip")
      val gen = File(trabalho, "gen")
      val classes = File(trabalho, "classes")
      val dex = File(trabalho, "dex")
      gen.mkdirs(); classes.mkdirs(); dex.mkdirs()
      val base = File(trabalho, "base.apk")
      val alinhado = File(trabalho, "alinhado.apk")

      // 1) aapt2 compile — recursos (res/) viram .flat
      log("1/6 aapt2 compile (recursos)")
      val res = File(src, "res")
      if (res.isDirectory) {
        val (codigo, out) = executar(
          listOf(aapt2.path, "compile", "--dir", res.path, "-o", compiladoRes.path)
        )
        if (codigo != 0) {
          erros += parseAapt(out, projeto)
          return falha("aapt2 compile")
        }
      }

      // 2) aapt2 link — manifest + recursos -> APK base + R.java
      log("2/6 aapt2 link (manifest, resources.arsc, R.java)")
      val link = mutableListOf(
        aapt2.path, "link",
        "-o", base.path,
        "-I", androidJar.path,
        "--manifest", manifest.path,
        "--java", gen.path,
        "--version-code", "1",
        "--version-name", "1.0"
      )
      val assets = File(src, "assets")
      if (assets.isDirectory) link += listOf("-A", assets.path)
      if (compiladoRes.exists()) link += compiladoRes.path
      val (codigoLink, saidaLink) = executar(link)
      if (codigoLink != 0) {
        erros += parseAapt(saidaLink, projeto)
        return falha("aapt2 link")
      }

      // 3) ECJ — .java -> .class
      log("3/6 ECJ (Java -> .class)")
      val fontes = mutableListOf<String>()
      listOf(File(src, "java"), gen).forEach { pasta ->
        pasta.walkTopDown()
          .filter { it.isFile && it.extension == "java" }
          .forEach { fontes += it.path }
      }
      if (fontes.isEmpty()) {
        erros += ErroCompilacao("app/src/main/java", 0, "Nenhum arquivo .java no projeto")
        return falha("ecj")
      }
      val saidaEcj = StringWriter()
      val escritor = PrintWriter(saidaEcj)
      val argsEcj = mutableListOf(
        "-1.8", "-g:none", "-nowarn", "-proc:none", "-encoding", "UTF-8",
        "-bootclasspath", androidJar.path,
        "-d", classes.path
      )
      argsEcj += fontes
      val okEcj = EcjMain(escritor, escritor, false).compile(argsEcj.toTypedArray())
      escritor.flush()
      if (!okEcj) {
        erros += parseEcj(saidaEcj.toString(), projeto)
        return falha("ecj")
      }

      // 4) D8 — .class -> classes.dex
      log("4/6 D8 (.class -> classes.dex)")
      val arquivosClass = classes.walkTopDown()
        .filter { it.isFile && it.extension == "class" }
        .map { it.toPath() }
        .toList()
      val handler = object : DiagnosticsHandler {
        override fun error(diagnostico: Diagnostic) {
          erros += ErroCompilacao("d8", 0, diagnostico.diagnosticMessage)
        }
        override fun warning(diagnostico: Diagnostic) {}
        override fun info(diagnostico: Diagnostic) {}
      }
      try {
        val comando = D8Command.builder(handler)
          .addProgramFiles(arquivosClass)
          .addLibraryFiles(androidJar.toPath())
          .setMinApiLevel(minSdk)
          .setMode(CompilationMode.RELEASE)
          .setOutput(dex.toPath(), OutputMode.DexIndexed)
          .build()
        D8.run(comando)
      } catch (e: CompilationFailedException) {
        if (erros.isEmpty()) erros += ErroCompilacao("d8", 0, e.message ?: "D8 falhou")
        return falha("d8")
      }
      val classesDex = File(dex, "classes.dex")
      if (!classesDex.exists()) {
        erros += ErroCompilacao("d8", 0, "D8 não gerou classes.dex")
        return falha("d8")
      }

      // 5) junta o dex no APK base (com resources.arsc alinhado em 4 bytes)
      log("5/6 montando APK")
      montarApkAlinhado(base, classesDex, alinhado)

      // 6) assina
      log("6/6 assinando (apksig)")
      saida.parentFile?.mkdirs()
      assinar(alinhado, saida, minSdk)

      log("Pronto: ${saida.length() / 1024} KB")
      return ResultadoBuild(true, saida.path, emptyList(), "ok")
    } catch (e: Throwable) {
      log("Falha inesperada: ${e.javaClass.simpleName}: ${e.message}")
      erros += ErroCompilacao("interno", 0, "${e.javaClass.simpleName}: ${e.message}")
      return falha("interno")
    }
  }

  // ---------- execução do aapt2 ----------
  private fun executar(cmd: List<String>): Pair<Int, String> {
    val processo = ProcessBuilder(cmd).redirectErrorStream(true).start()
    val saida = processo.inputStream.bufferedReader().use { it.readText() }
    return Pair(processo.waitFor(), saida)
  }

  private fun relativo(caminho: String, projeto: File): String =
    caminho.removePrefix(projeto.path).trimStart('/')

  // aapt2: "/caminho/arquivo.xml:12: error: mensagem"
  private fun parseAapt(saida: String, projeto: File): List<ErroCompilacao> {
    val lista = mutableListOf<ErroCompilacao>()
    val comLinha = Regex("""^(.+?):(\d+): error: (.+)$""")
    val semLinha = Regex("""^(.+?): error: (.+)$""")
    for (linha in saida.lines()) {
      val t = linha.trim()
      val a = comLinha.find(t)
      val b = semLinha.find(t)
      when {
        a != null -> lista += ErroCompilacao(
          relativo(a.groupValues[1], projeto), a.groupValues[2].toInt(), a.groupValues[3]
        )
        b != null -> lista += ErroCompilacao(
          relativo(b.groupValues[1], projeto), 0, b.groupValues[2]
        )
        t.startsWith("error:") -> lista += ErroCompilacao(
          "aapt2", 0, t.removePrefix("error:").trim()
        )
      }
    }
    if (lista.isEmpty() && saida.isNotBlank()) {
      lista += ErroCompilacao("aapt2", 0, saida.trim().take(600))
    }
    return lista
  }

  // ECJ: "1. ERROR in /caminho/Main.java (at line 5)" ... mensagem ... "----------"
  private fun parseEcj(saida: String, projeto: File): List<ErroCompilacao> {
    val lista = mutableListOf<ErroCompilacao>()
    val cabecalho = Regex("""^\d+\. ERROR in (.+?) \(at line (\d+)\)""")
    val linhas = saida.lines()
    var i = 0
    while (i < linhas.size) {
      val m = cabecalho.find(linhas[i].trim())
      if (m != null) {
        var j = i + 1
        val corpo = mutableListOf<String>()
        while (j < linhas.size && !linhas[j].startsWith("----------")) {
          corpo += linhas[j]
          j++
        }
        val mensagem = corpo.lastOrNull { it.isNotBlank() }?.trim() ?: "erro de compilação"
        lista += ErroCompilacao(
          relativo(m.groupValues[1], projeto), m.groupValues[2].toInt(), mensagem
        )
        i = j
      } else {
        i++
      }
    }
    if (lista.isEmpty() && saida.isNotBlank()) {
      lista += ErroCompilacao("java", 0, saida.trim().take(600))
    }
    return lista
  }

  // ---------- zip com alinhamento ----------
  // Conta os bytes escritos, pra saber em que posição cada entrada começa.
  private class ContaBytes(destino: OutputStream) : FilterOutputStream(destino) {
    var total = 0L
    override fun write(b: Int) { out.write(b); total++ }
    override fun write(b: ByteArray, off: Int, len: Int) { out.write(b, off, len); total += len }
  }

  // Android 11+ exige resources.arsc SEM compressão e alinhado em 4 bytes
  // (o que o zipalign faz). Aqui copiamos o APK do aapt2 e acrescentamos
  // o classes.dex, alinhando o resources.arsc com padding no "extra".
  private fun montarApkAlinhado(base: File, dex: File, destino: File) {
    val contador = ContaBytes(BufferedOutputStream(FileOutputStream(destino)))
    ZipOutputStream(contador).use { zos ->
      ZipFile(base).use { zin ->
        for (entrada in zin.entries().toList()) {
          if (entrada.isDirectory) continue
          val bytes = zin.getInputStream(entrada).use { it.readBytes() }
          gravarEntrada(zos, contador, entrada.name, bytes, entrada.name == "resources.arsc")
        }
      }
      gravarEntrada(zos, contador, "classes.dex", dex.readBytes(), false)
    }
  }

  private fun gravarEntrada(
    zos: ZipOutputStream, contador: ContaBytes, nome: String, bytes: ByteArray, guardar: Boolean
  ) {
    val entrada = ZipEntry(nome)
    if (guardar) {
      val crc = CRC32().apply { update(bytes) }
      entrada.method = ZipEntry.STORED
      entrada.size = bytes.size.toLong()
      entrada.compressedSize = bytes.size.toLong()
      entrada.crc = crc.value
      // cabeçalho local = 30 bytes fixos + nome + extra; os dados vêm logo depois
      val tamanhoNome = nome.toByteArray(Charsets.UTF_8).size
      val pad = ((4 - ((contador.total + 30 + tamanhoNome) % 4)) % 4).toInt()
      if (pad > 0) entrada.extra = ByteArray(pad)
    } else {
      entrada.method = ZipEntry.DEFLATED
    }
    zos.putNextEntry(entrada)
    zos.write(bytes)
    zos.closeEntry()
  }

  // ---------- assinatura ----------
  // Chave RSA no AndroidKeyStore (o Android gera o certificado sozinho).
  // Fica a mesma entre compilações, então o APK novo atualiza o anterior.
  // Se o Cindra for desinstalado/ter os dados limpos, a chave some e o app
  // gerado antes precisa ser desinstalado pra instalar o novo.
  private fun assinar(entrada: File, saida: File, minSdk: Int) {
    val (chave, certificado) = chaveDeAssinatura()
    val config = ApkSigner.SignerConfig.Builder("cindrastudio", chave, listOf(certificado)).build()
    ApkSigner.Builder(listOf(config))
      .setInputApk(entrada)
      .setOutputApk(saida)
      .setMinSdkVersion(minSdk)
      .setV1SigningEnabled(true)
      .setV2SigningEnabled(true)
      .setV3SigningEnabled(true)
      .build()
      .sign()
  }

  private fun chaveDeAssinatura(): Pair<PrivateKey, X509Certificate> {
    val alias = "cindrastudio_debug"
    val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    if (!ks.containsAlias(alias)) {
      val gerador = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, "AndroidKeyStore")
      val agora = System.currentTimeMillis()
      gerador.initialize(
        KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
          .setKeySize(2048)
          .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)
          .setSignaturePaddings(
            KeyProperties.SIGNATURE_PADDING_RSA_PKCS1,
            KeyProperties.SIGNATURE_PADDING_RSA_PSS
          )
          .setCertificateSubject(X500Principal("CN=CindraStudio Debug"))
          .setCertificateNotBefore(Date(agora - 24L * 3600 * 1000))
          .setCertificateNotAfter(Date(agora + 30L * 365 * 24 * 3600 * 1000))
          .build()
      )
      gerador.generateKeyPair()
    }
    val chave = ks.getKey(alias, null) as PrivateKey
    val certificado = ks.getCertificate(alias) as X509Certificate
    return Pair(chave, certificado)
  }
}
