package expo.modules.apkbuilder

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.android.apksig.ApkSigner
import com.android.apksig.ApkVerifier
import com.android.tools.r8.CompilationFailedException
import com.android.tools.r8.CompilationMode
import com.android.tools.r8.D8
import com.android.tools.r8.D8Command
import com.android.tools.r8.Diagnostic
import com.android.tools.r8.DiagnosticsHandler
import com.android.tools.r8.OutputMode
import com.android.tools.r8.R8
import com.android.tools.r8.R8Command
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
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.UnrecoverableKeyException
import java.security.PrivateKey
import java.security.cert.X509Certificate
import java.util.Date
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
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

// Dados da assinatura RELEASE (keystore do próprio usuário). Se vier null,
// o build é assinado com a chave de debug interna (AndroidKeyStore).
data class ConfigAssinatura(
  val keystore: String,
  val senhaKeystore: String,
  val alias: String,
  val senhaChave: String
)

// Erro de assinatura com mensagem já pronta pra mostrar pra pessoa.
class ErroAssinatura(mensagem: String) : Exception(mensagem)

/**
 * Projeto esperado em <pasta>/app/src/main/{AndroidManifest.xml, java, res, assets}
 * (é o que o CindraStudio grava em disco).
 */
class ApkPipeline(private val ctx: Context, private val log: (String) -> Unit) {

  fun compilar(
    projeto: File,
    androidJar: File,
    saida: File,
    assinatura: ConfigAssinatura? = null
  ): ResultadoBuild {
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

      val manifestTextoOriginal = manifest.readText()
      val minSdk = Regex("""minSdkVersion\s*=\s*"(\d+)"""")
        .find(manifestTextoOriginal)?.groupValues?.get(1)?.toInt() ?: 21
      val pacote = Regex("""package\s*=\s*"([\w.]+)"""")
        .find(manifestTextoOriginal)?.groupValues?.get(1)
      if (pacote == null) {
        erros += ErroCompilacao("AndroidManifest.xml", 0, "atributo package não encontrado")
        return falha("preparo")
      }

      val trabalho = File(projeto, ".build")
      trabalho.deleteRecursively()
      val compiladoRes = File(trabalho, "res.zip")
      val gen = File(trabalho, "gen")
      val classes = File(trabalho, "classes")
      val dex = File(trabalho, "dex")
      gen.mkdirs(); classes.mkdirs(); dex.mkdirs()
      val base = File(trabalho, "base.apk")
      val alinhado = File(trabalho, "alinhado.apk")

      // 0) proteções — preparadas ANTES de compilar, porque tanto a checagem
      // de assinatura quanto a chave de criptografia dos assets dependem de
      // já saber com qual certificado o APK vai ser assinado no fim.
      log("0/7 preparando proteções (assinatura + criptografia dos assets)")
      val (signerConfig, hashCert) = try {
        prepararAssinatura(assinatura)
      } catch (e: ErroAssinatura) {
        erros += ErroCompilacao("assinatura", 0, e.message ?: "Falha ao preparar assinatura")
        return falha("assinatura")
      }
      val hashCertHex = hashCert.joinToString("") { "%02x".format(it) }

      // classe que confere, em tempo de execução, se o certificado do APK
      // instalado bate com o que assinou este build (se não bater, o app
      // foi reempacotado com outra chave e se fecha sozinho)
      val pacotePath = pacote.replace('.', '/')
      val pastaJavaPkg = File(src, "java/$pacotePath")
      pastaJavaPkg.mkdirs()
      File(pastaJavaPkg, "Integridade.java").writeText(gerarFonteIntegridade(pacote, hashCertHex))
      File(pastaJavaPkg, "AssetCripto.java").writeText(gerarFonteAssetCripto(pacote))

      if (!manifestTextoOriginal.contains("Integridade")) {
        val provider = "    <provider\n" +
          "        android:name=\".Integridade\"\n" +
          "        android:authorities=\"${pacote}.integridadeprovider\"\n" +
          "        android:exported=\"false\"\n" +
          "        android:initOrder=\"999\" />\n</application>"
        manifest.writeText(manifestTextoOriginal.replace("</application>", provider))
      }

      // assets cifrados: se a pessoa colocou foto/música/etc em assets/, uma
      // cópia cifrada (AES-256/GCM, chave derivada do certificado + pacote)
      // é o que entra no APK — o original no projeto não é tocado. Quem
      // extrair o APK e tentar reaproveitar os arquivos não consegue, e
      // copiá-los pra outro app também não funciona (a chave é amarrada a
      // este certificado e a este pacote).
      val assetsOriginais = File(src, "assets")
      val assetsParaEmpacotar: File = if (assetsOriginais.isDirectory &&
        assetsOriginais.walkTopDown().any { it.isFile }
      ) {
        val cifrados = File(trabalho, "assets_cifrados")
        val chaveAssets = MessageDigest.getInstance("SHA-256")
          .digest(hashCert + pacote.toByteArray(Charsets.UTF_8))
        criptografarAssets(assetsOriginais, cifrados, chaveAssets)
        cifrados
      } else {
        assetsOriginais
      }

      // 1) aapt2 compile — recursos (res/) viram .flat
      log("1/7 aapt2 compile (recursos)")
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
      log("2/7 aapt2 link (manifest, resources.arsc, R.java)")
      val link = mutableListOf(
        aapt2.path, "link",
        "-o", base.path,
        "-I", androidJar.path,
        "--manifest", manifest.path,
        "--java", gen.path,
        "--version-code", "1",
        "--version-name", "1.0"
      )
      if (assetsParaEmpacotar.isDirectory) link += listOf("-A", assetsParaEmpacotar.path)
      if (compiladoRes.exists()) link += compiladoRes.path
      val (codigoLink, saidaLink) = executar(link)
      if (codigoLink != 0) {
        erros += parseAapt(saidaLink, projeto)
        return falha("aapt2 link")
      }

      // 3) ECJ — .java -> .class
      log("3/7 ECJ (Java -> .class)")
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

      // 4) D8 (debug) ou R8 (release: assinatura != null) — .class -> classes.dex
      // R8 faz o que o D8 faz e, além disso, ofusca nomes de classe/método e
      // remove código morto. Só entra quando há keystore de release — builds
      // de debug ficam rápidos e legíveis pra não atrapalhar quem tá testando.
      val ehRelease = assinatura != null
      log(if (ehRelease) "4/7 R8 (.class -> classes.dex, ofuscado)" else "4/7 D8 (.class -> classes.dex)")
      val arquivosClass = classes.walkTopDown()
        .filter { it.isFile && it.extension == "class" }
        .map { it.toPath() }
        .toList()
      val handler = object : DiagnosticsHandler {
        override fun error(diagnostico: Diagnostic) {
          erros += ErroCompilacao(if (ehRelease) "r8" else "d8", 0, diagnostico.diagnosticMessage)
        }
        override fun warning(diagnostico: Diagnostic) {}
        override fun info(diagnostico: Diagnostic) {}
      }
      try {
        if (ehRelease) {
          val regras = regrasProguard(pacote)
          val comando = R8Command.builder(handler)
            .addProgramFiles(arquivosClass)
            .addLibraryFiles(androidJar.toPath())
            .addProguardConfiguration(listOf(regras), com.android.tools.r8.origin.Origin.unknown())
            .setMinApiLevel(minSdk)
            .setMode(CompilationMode.RELEASE)
            .setOutput(dex.toPath(), OutputMode.DexIndexed)
            .build()
          R8.run(comando)
        } else {
          val comando = D8Command.builder(handler)
            .addProgramFiles(arquivosClass)
            .addLibraryFiles(androidJar.toPath())
            .setMinApiLevel(minSdk)
            .setMode(CompilationMode.RELEASE)
            .setOutput(dex.toPath(), OutputMode.DexIndexed)
            .build()
          D8.run(comando)
        }
      } catch (e: CompilationFailedException) {
        val etapa = if (ehRelease) "r8" else "d8"
        if (erros.isEmpty()) erros += ErroCompilacao(etapa, 0, e.message ?: "$etapa falhou")
        return falha(etapa)
      }
      val classesDex = File(dex, "classes.dex")
      if (!classesDex.exists()) {
        erros += ErroCompilacao(if (ehRelease) "r8" else "d8", 0, "Não gerou classes.dex")
        return falha(if (ehRelease) "r8" else "d8")
      }

      // 5) junta o dex no APK base (com resources.arsc alinhado em 4 bytes)
      log("5/7 montando APK")
      montarApkAlinhado(base, classesDex, alinhado)

      // 6) assina
      log("6/7 assinando (apksig)")
      saida.parentFile?.mkdirs()
      try {
        assinar(alinhado, saida, minSdk, signerConfig)
      } catch (e: ErroAssinatura) {
        erros += ErroCompilacao("assinatura", 0, e.message ?: "Falha ao assinar")
        return falha("assinatura")
      }

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
  // Sem config: chave de DEBUG no AndroidKeyStore (o Android gera o certificado
  // sozinho). Fica a mesma entre compilações, então o APK novo atualiza o
  // anterior. Se o Cindra for desinstalado/ter os dados limpos, a chave some e
  // o app gerado antes precisa ser desinstalado pra instalar o novo.
  // Com config: assina com o keystore do usuário (release). Sempre v1+v2+v3.
  // Resolve a chave/certificado UMA vez por build (chamado antes de compilar,
  // porque o hash do certificado também alimenta a checagem de integridade e
  // a chave de criptografia dos assets). O SignerConfig pronto é reusado na
  // assinatura final, lá no fim do pipeline.
  private fun prepararAssinatura(cfg: ConfigAssinatura?): Pair<ApkSigner.SignerConfig, ByteArray> {
    if (cfg != null) {
      val (chave, cadeia, aliasReal) = chaveDoKeystore(cfg)
      log("Assinando com a chave do keystore (alias: $aliasReal)")
      val config = ApkSigner.SignerConfig.Builder(nomeDoSigner(aliasReal), chave, cadeia).build()
      val hash = MessageDigest.getInstance("SHA-256").digest(cadeia[0].encoded)
      return Pair(config, hash)
    }
    val (chave, certificado) = chaveDeAssinatura()
    val config = ApkSigner.SignerConfig.Builder("cindrastudio", chave, listOf(certificado)).build()
    val hash = MessageDigest.getInstance("SHA-256").digest(certificado.encoded)
    return Pair(config, hash)
  }

  private fun assinar(entrada: File, saida: File, minSdk: Int, config: ApkSigner.SignerConfig) {
    ApkSigner.Builder(listOf(config))
      .setInputApk(entrada)
      .setOutputApk(saida)
      .setMinSdkVersion(minSdk)
      .setV1SigningEnabled(true)
      .setV2SigningEnabled(true)
      .setV3SigningEnabled(true)
      .build()
      .sign()
    verificar(saida)
  }

  // ---------- ofuscação (R8, só release) ----------
  // Mantém de pé tudo que o Android precisa achar pelo nome: Activity,
  // Service, BroadcastReceiver, ContentProvider (inclui a Integridade),
  // Application e a classe de criptografia de assets (chamada por nome
  // vindo dos blocos de código, não dá pra ofuscar).
  private fun regrasProguard(pacote: String): String = """
    -keep public class * extends android.app.Activity
    -keep public class * extends android.app.Service
    -keep public class * extends android.content.BroadcastReceiver
    -keep public class * extends android.content.ContentProvider
    -keep public class * extends android.app.Application
    -keep public class $pacote.AssetCripto { *; }
    -keep public class $pacote.Integridade { *; }
    -keepclassmembers class * extends android.app.Activity {
        public void *(android.view.View);
    }
    -keepattributes *Annotation*,Signature,InnerClasses
    -dontwarn **
  """.trimIndent()

  // ---------- criptografia dos assets ----------
  // Copia app/src/main/assets/ pra uma pasta temporária, cifrando cada
  // arquivo com AES-256/GCM (IV aleatório de 12 bytes na frente de cada
  // arquivo cifrado). O projeto original no disco não é alterado — só a
  // cópia em .build/ (que é o que entra no APK) fica cifrada.
  private fun criptografarAssets(origem: File, destino: File, chave: ByteArray) {
    destino.deleteRecursively()
    destino.mkdirs()
    val chaveSpec = SecretKeySpec(chave, "AES")
    val aleatorio = SecureRandom()
    origem.walkTopDown().filter { it.isFile }.forEach { arquivo ->
      val relativo = arquivo.relativeTo(origem).path
      val alvo = File(destino, relativo)
      alvo.parentFile?.mkdirs()
      val iv = ByteArray(12).also { aleatorio.nextBytes(it) }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, chaveSpec, GCMParameterSpec(128, iv))
      val cifrado = cipher.doFinal(arquivo.readBytes())
      alvo.writeBytes(iv + cifrado)
    }
  }

  // ---------- código gerado: checagem de assinatura ----------
  // ContentProvider porque roda sozinho no início do processo (antes mesmo
  // da Application), sem precisar mexer na marca d'água nem em nenhum outro
  // arquivo gerado. Se o certificado instalado não bater com o hash fixado
  // aqui, o processo é encerrado — app reempacotado com outra chave não abre.
  private fun gerarFonteIntegridade(pacote: String, hashCertHex: String): String = """
    package $pacote;

    import android.content.ContentProvider;
    import android.content.ContentValues;
    import android.content.Context;
    import android.content.pm.PackageInfo;
    import android.content.pm.PackageManager;
    import android.database.Cursor;
    import android.net.Uri;
    import android.os.Build;
    import android.os.Process;
    import java.security.MessageDigest;

    public final class Integridade extends ContentProvider {

        private static final String HASH_ESPERADO = "$hashCertHex";
        public static final byte[] HASH_ESPERADO_BYTES = hexParaBytes(HASH_ESPERADO);

        @Override
        public boolean onCreate() {
            try {
                if (!assinaturaOk()) {
                    Process.killProcess(Process.myPid());
                }
            } catch (Throwable ignorado) {
                // se a checagem falhar por algum motivo do aparelho (não por
                // reempacotamento), o app segue normalmente
            }
            return true;
        }

        private boolean assinaturaOk() throws Exception {
            Context ctx = getContext();
            PackageManager pm = ctx.getPackageManager();
            String pacote = ctx.getPackageName();
            byte[] certBytes;
            if (Build.VERSION.SDK_INT >= 28) {
                PackageInfo info = pm.getPackageInfo(pacote, PackageManager.GET_SIGNING_CERTIFICATES);
                certBytes = info.signingInfo.hasMultipleSigners()
                    ? info.signingInfo.getApkContentsSigners()[0].toByteArray()
                    : info.signingInfo.getSigningCertificateHistory()[0].toByteArray();
            } else {
                PackageInfo info = pm.getPackageInfo(pacote, PackageManager.GET_SIGNATURES);
                certBytes = info.signatures[0].toByteArray();
            }
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hashAtual = md.digest(certBytes);
            return MessageDigest.isEqual(hashAtual, HASH_ESPERADO_BYTES);
        }

        private static byte[] hexParaBytes(String hex) {
            int n = hex.length();
            byte[] out = new byte[n / 2];
            for (int i = 0; i < n; i += 2) {
                out[i / 2] = (byte) Integer.parseInt(hex.substring(i, i + 2), 16);
            }
            return out;
        }

        @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
        @Override public String getType(Uri u) { return null; }
        @Override public Uri insert(Uri u, ContentValues v) { return null; }
        @Override public int delete(Uri u, String s, String[] a) { return 0; }
        @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
    }
  """.trimIndent()

  // ---------- código gerado: leitura dos assets cifrados ----------
  // A chave nunca fica gravada em lugar nenhum: é recalculada em tempo de
  // execução a partir do mesmo hash de certificado que a Integridade já
  // confere + o nome do pacote. Por isso um asset cifrado só abre dentro
  // deste app exato, assinado com esta chave exata.
  private fun gerarFonteAssetCripto(pacote: String): String = """
    package $pacote;

    import android.content.Context;
    import java.io.ByteArrayInputStream;
    import java.io.ByteArrayOutputStream;
    import java.io.File;
    import java.io.FileOutputStream;
    import java.io.IOException;
    import java.io.InputStream;
    import java.io.OutputStream;
    import java.security.MessageDigest;
    import javax.crypto.Cipher;
    import javax.crypto.spec.GCMParameterSpec;
    import javax.crypto.spec.SecretKeySpec;

    public final class AssetCripto {
        private AssetCripto() {}

        // devolve o conteúdo já decifrado em memória (bom pra imagens, texto etc.)
        public static InputStream abrir(Context ctx, String nome) throws IOException {
            try {
                byte[] bruto = lerTudo(ctx.getAssets().open(nome));
                byte[] iv = new byte[12];
                System.arraycopy(bruto, 0, iv, 0, 12);
                Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
                c.init(Cipher.DECRYPT_MODE, new SecretKeySpec(chave(ctx), "AES"), new GCMParameterSpec(128, iv));
                byte[] claro = c.doFinal(bruto, 12, bruto.length - 12);
                return new ByteArrayInputStream(claro);
            } catch (IOException e) {
                throw e;
            } catch (Exception e) {
                throw new IOException("Falha ao abrir asset protegido: " + nome, e);
            }
        }

        // decifra pra um arquivo temporário no cache do app (bom pra MediaPlayer,
        // que precisa de um caminho/descritor de arquivo, não de um InputStream)
        public static File paraArquivoTemporario(Context ctx, String nome) throws IOException {
            File destino = new File(ctx.getCacheDir(), "ac_" + nome.replace("/", "_"));
            try (InputStream in = abrir(ctx, nome); OutputStream out = new FileOutputStream(destino)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            }
            return destino;
        }

        private static byte[] lerTudo(InputStream in) throws IOException {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
            in.close();
            return bos.toByteArray();
        }

        private static byte[] chave(Context ctx) throws Exception {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(Integridade.HASH_ESPERADO_BYTES);
            md.update(ctx.getPackageName().getBytes("UTF-8"));
            return md.digest();
        }
    }
  """.trimIndent()

  // Confere o APK final (o mesmo teste do apksig oficial). Só informa no log;
  // se o verificador em si quebrar, não derruba o build.
  private fun verificar(apk: File) {
    try {
      val r = ApkVerifier.Builder(apk).build().verify()
      if (r.isVerified) {
        log("Assinatura conferida (v1=${r.isVerifiedUsingV1Scheme}, v2=${r.isVerifiedUsingV2Scheme}, v3=${r.isVerifiedUsingV3Scheme})")
      } else {
        log("Aviso: a conferência da assinatura achou ${r.errors.size} problema(s)")
      }
    } catch (e: Throwable) {
      log("Conferência da assinatura indisponível: ${e.javaClass.simpleName}")
    }
  }

  // Nome do signer v1 (vira META-INF/NOME.SF): só letras/números, até 8 chars.
  private fun nomeDoSigner(alias: String): String {
    val limpo = alias.filter { it.isLetterOrDigit() }.take(8)
    return if (limpo.isEmpty()) "CERT" else limpo.uppercase()
  }

  private fun chaveDoKeystore(cfg: ConfigAssinatura): Triple<PrivateKey, List<X509Certificate>, String> {
    val arq = File(cfg.keystore)
    if (!arq.isFile) throw ErroAssinatura("Keystore não encontrado. Escolha o arquivo de novo.")
    val senhaStore = cfg.senhaKeystore.toCharArray()

    // Android só abre PKCS12 (.p12/.pfx) e BKS. JKS (.jks) é formato Java
    // de desktop e não existe no Android — avisa como converter.
    val cabecalho = ByteArray(4)
    arq.inputStream().use { it.read(cabecalho) }
    val ehJks = cabecalho[0] == 0xFE.toByte() && cabecalho[1] == 0xED.toByte() &&
      cabecalho[2] == 0xFE.toByte() && cabecalho[3] == 0xED.toByte()
    if (ehJks) {
      throw ErroAssinatura(
        "Este keystore é .jks (formato Java antigo), que o Android não abre. " +
          "Converta no PC: keytool -importkeystore -srckeystore app.jks " +
          "-destkeystore app.p12 -deststoretype PKCS12"
      )
    }
    val tipo = if (cabecalho[0] == 0x30.toByte()) "PKCS12" else "BKS"
    val ks = try {
      KeyStore.getInstance(tipo).apply { arq.inputStream().use { load(it, senhaStore) } }
    } catch (e: java.io.IOException) {
      val msg = (e.message ?: "").lowercase()
      if (msg.contains("password") || msg.contains("mac") || msg.contains("tampered")) {
        throw ErroAssinatura("Senha do keystore incorreta.")
      }
      throw ErroAssinatura("Não consegui abrir o keystore ($tipo): ${e.message}")
    } catch (e: Exception) {
      throw ErroAssinatura("Não consegui abrir o keystore ($tipo): ${e.javaClass.simpleName} ${e.message ?: ""}".trim())
    }

    val todos = ks.aliases().toList()
    val aliasReal = when {
      cfg.alias.isBlank() && todos.size == 1 -> todos[0]
      else -> todos.firstOrNull { it.equals(cfg.alias, ignoreCase = true) }
    } ?: throw ErroAssinatura(
      "Alias \"${cfg.alias}\" não existe no keystore. Aliases disponíveis: ${todos.joinToString(", ").ifEmpty { "nenhum" }}"
    )

    val senhaChave = (if (cfg.senhaChave.isEmpty()) cfg.senhaKeystore else cfg.senhaChave).toCharArray()
    val chaveBruta = try {
      ks.getKey(aliasReal, senhaChave)
    } catch (e: UnrecoverableKeyException) {
      throw ErroAssinatura("Senha da chave incorreta.")
    }
    val chave = chaveBruta as? PrivateKey
      ?: throw ErroAssinatura("O alias \"$aliasReal\" não tem chave privada.")

    val cadeia = ks.getCertificateChain(aliasReal)?.map { it as X509Certificate }
    if (cadeia.isNullOrEmpty()) throw ErroAssinatura("O alias \"$aliasReal\" não tem certificado.")
    return Triple(chave, cadeia, aliasReal)
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
