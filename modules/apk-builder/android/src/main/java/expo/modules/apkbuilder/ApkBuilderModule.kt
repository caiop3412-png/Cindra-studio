package expo.modules.apkbuilder

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.zip.ZipFile

class ApkBuilderModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "Contexto do React indisponível" }

  override fun definition() = ModuleDefinition {
    Name("ApkBuilder")

    Events("onLog")

    // Diz se o aapt2 chegou no aparelho (nativeLibraryDir) e a versão do Android.
    AsyncFunction("ambiente") {
      val aapt2 = File(context.applicationInfo.nativeLibraryDir, "libaapt2.so")
      mapOf(
        "aapt2" to aapt2.exists(),
        "sdk" to Build.VERSION.SDK_INT,
        "abis" to Build.SUPPORTED_ABIS.toList()
      )
    }

    // Tira o android.jar de dentro do zip da plataforma (platform-XX.zip).
    AsyncFunction("extrairAndroidJar") { zipPath: String, destino: String ->
      ZipFile(zipPath).use { zip ->
        val entrada = zip.entries().toList().firstOrNull {
          it.name == "android.jar" || it.name.endsWith("/android.jar")
        } ?: throw IllegalStateException("android.jar não encontrado dentro do zip")
        val saida = File(destino)
        saida.parentFile?.mkdirs()
        zip.getInputStream(entrada).use { entradaStream ->
          FileOutputStream(saida).use { saidaStream -> entradaStream.copyTo(saidaStream) }
        }
        saida.length().toDouble()
      }
    }

    // Roda o pipeline inteiro (aapt2 -> ECJ -> D8 -> zip alinhado -> apksig).
    // AsyncFunction já roda fora da thread de JS, então não trava a tela.
    // opcoes (opcional): { release: true, keystore, senhaKeystore, alias, senhaChave }.
    // Sem release (ou sem opcoes) assina com a chave de debug interna.
    AsyncFunction("compilar") { pastaProjeto: String, androidJar: String, apkSaida: String, opcoes: Map<String, Any?>? ->
      val ctx = context
      val pipeline = ApkPipeline(ctx) { linha ->
        sendEvent("onLog", mapOf("linha" to linha))
      }
      val release = opcoes?.get("release") == true
      val assinatura = if (release) {
        ConfigAssinatura(
          keystore = (opcoes?.get("keystore") as? String).orEmpty(),
          senhaKeystore = (opcoes?.get("senhaKeystore") as? String).orEmpty(),
          alias = (opcoes?.get("alias") as? String).orEmpty().trim(),
          senhaChave = (opcoes?.get("senhaChave") as? String).orEmpty()
        )
      } else null

      // Serviço em primeiro plano: segura o app vivo mesmo fora da tela / com economia de bateria.
      CompilacaoService.iniciar(ctx)
      val resultado = try {
        pipeline.compilar(File(pastaProjeto), File(androidJar), File(apkSaida), assinatura)
      } catch (e: Throwable) {
        CompilacaoService.parar(ctx)
        throw e
      }
      val appVisivel = appEmPrimeiroPlano()
      CompilacaoService.parar(ctx)

      // Só avisa por notificação se a pessoa saiu do app durante o build.
      if (!appVisivel) {
        val nome = File(pastaProjeto).name
        if (resultado.ok) {
          CompilacaoService.notificarResultado(ctx, "APK pronto", "$nome foi compilado. Toque pra abrir o Cindra Studio e instalar.")
        } else {
          CompilacaoService.notificarResultado(ctx, "Erro na compilação", "$nome não compilou. Toque pra ver os erros.")
        }
      }
      resultado.paraMapa()
    }

    // Economia de bateria: o Android deixa o app rodar solto em segundo plano
    // quando a pessoa libera (aparece uma janelinha do sistema, uma vez só).
    AsyncFunction("bateriaLiberada") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    AsyncFunction("pedirLiberarBateria") {
      val ctx = context
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
      val prefs = ctx.getSharedPreferences("apkbuilder_prefs", Context.MODE_PRIVATE)
      if (pm.isIgnoringBatteryOptimizations(ctx.packageName)) return@AsyncFunction "liberado"
      if (prefs.getBoolean("pediu_bateria", false)) return@AsyncFunction "ja_pediu"
      prefs.edit().putBoolean("pediu_bateria", true).apply()
      val pedido = Intent(
        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:${ctx.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(pedido)
      "aberto"
    }

    // Android 11+: o app tem "Acesso a todos os arquivos" liberado?
    // Antes do 11 devolve true e quem decide é o mkdirs de criarPasta.
    AsyncFunction("temAcessoTodosArquivos") {
      if (Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager() else true
    }

    // Abre direto a tela "Acesso a todos os arquivos" DESTE app.
    AsyncFunction("abrirAcessoTodosArquivos") {
      val ctx = context
      if (Build.VERSION.SDK_INT >= 30) {
        try {
          ctx.startActivity(
            Intent(
              Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
              Uri.parse("package:${ctx.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
        } catch (e: Exception) {
          ctx.startActivity(
            Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
        }
      }
      true
    }

    // Cria a pasta (com as pais) e confirma que dá pra gravar nela.
    AsyncFunction("criarPasta") { caminho: String ->
      val pasta = File(caminho.removePrefix("file://"))
      pasta.mkdirs()
      pasta.isDirectory && pasta.canWrite()
    }

    // Copia um arquivo. Se o destino já existir, cria "nome-2.ext", "nome-3.ext"...
    // Devolve o caminho final (file://...).
    AsyncFunction("copiarArquivo") { origem: String, destino: String ->
      val de = File(origem.removePrefix("file://"))
      var para = File(destino.removePrefix("file://"))
      para.parentFile?.mkdirs()
      var n = 2
      while (para.exists() && n < 200) {
        val base = para.nameWithoutExtension.replace(Regex("-\\d+$"), "")
        val ext = if (para.extension.isNotEmpty()) "." + para.extension else ""
        para = File(para.parentFile, "$base-$n$ext")
        n += 1
      }
      de.inputStream().use { entrada ->
        FileOutputStream(para).use { saida -> entrada.copyTo(saida) }
      }
      "file://" + para.absolutePath
    }

    // Abre o instalador do Android com o APK gerado.
    AsyncFunction("instalar") { apkPath: String ->
      val ctx = context
      if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
        val ajustes = Intent(
          Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
          Uri.parse("package:${ctx.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(ajustes)
        return@AsyncFunction "permissao"
      }
      val uri = FileProvider.getUriForFile(
        ctx,
        "${ctx.packageName}.apkbuilder.fileprovider",
        File(apkPath)
      )
      val instalar = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      ctx.startActivity(instalar)
      "ok"
    }
  }

  // true = a tela do Cindra está visível agora (mesmo com o serviço rodando).
  private fun appEmPrimeiroPlano(): Boolean {
    val info = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(info)
    return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }
}
