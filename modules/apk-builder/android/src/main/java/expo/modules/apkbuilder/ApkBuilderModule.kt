package expo.modules.apkbuilder

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
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
      val pipeline = ApkPipeline(context) { linha ->
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
      pipeline.compilar(File(pastaProjeto), File(androidJar), File(apkSaida), assinatura).paraMapa()
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
}
