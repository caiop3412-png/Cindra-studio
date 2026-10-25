package expo.modules.apkbuilder

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Serviço em primeiro plano que mantém o Cindra vivo enquanto compila
 * (o Android não mata o app nem corta a CPU com a tela apagada / fora do app).
 * Também guarda as funções de notificação do build.
 */
class CompilacaoService : Service() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    criarCanais(this)
    val notificacao: Notification = NotificationCompat.Builder(this, CANAL_ANDAMENTO)
      .setSmallIcon(iconePequeno(this))
      .setContentTitle("Compilando seu app")
      .setContentText("O Cindra Studio continua trabalhando em segundo plano")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setProgress(0, 0, true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(abrirApp(this))
      .build()
    ServiceCompat.startForeground(
      this, ID_ANDAMENTO, notificacao, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    )
    segurarCpu()
    return START_NOT_STICKY
  }

  // Mantém a CPU ligada durante o build (solta sozinho em 30 min, por segurança).
  private fun segurarCpu() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CindraStudio:compilacao").apply {
      setReferenceCounted(false)
      acquire(30L * 60L * 1000L)
    }
  }

  override fun onDestroy() {
    try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Throwable) {}
    wakeLock = null
    super.onDestroy()
  }

  companion object {
    const val CANAL_ANDAMENTO = "cindra_build_andamento"
    const val CANAL_RESULTADO = "cindra_build_resultado"
    const val ID_ANDAMENTO = 7101
    const val ID_RESULTADO = 7102

    fun iniciar(ctx: Context) {
      try {
        ContextCompat.startForegroundService(ctx, Intent(ctx, CompilacaoService::class.java))
      } catch (_: Throwable) {
        // Se o Android recusar (app sem estar visível), compila do mesmo jeito, sem o serviço.
      }
    }

    // Espera um pouco antes de parar: se o build falhar na hora, o serviço
    // ainda não chamou startForeground() e o Android derrubaria o app.
    fun parar(ctx: Context) {
      Handler(Looper.getMainLooper()).postDelayed({
        try { ctx.stopService(Intent(ctx, CompilacaoService::class.java)) } catch (_: Throwable) {}
      }, 1500)
    }

    // Ícone pequeno: o notification-icon.png dos assets (o plugin do
    // expo-notifications copia ele pra drawable/notification_icon no build).
    fun iconePequeno(ctx: Context): Int {
      val id = ctx.resources.getIdentifier("notification_icon", "drawable", ctx.packageName)
      return if (id != 0) id else android.R.drawable.stat_sys_download
    }

    fun abrirApp(ctx: Context): PendingIntent? {
      val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      return PendingIntent.getActivity(ctx, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    fun criarCanais(ctx: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.createNotificationChannel(
        NotificationChannel(CANAL_ANDAMENTO, "Compilação em andamento", NotificationManager.IMPORTANCE_LOW)
      )
      nm.createNotificationChannel(
        NotificationChannel(CANAL_RESULTADO, "Resultado da compilação", NotificationManager.IMPORTANCE_HIGH)
      )
    }

    fun notificarResultado(ctx: Context, titulo: String, texto: String) {
      if (Build.VERSION.SDK_INT >= 33 &&
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
      ) return
      criarCanais(ctx)
      val n = NotificationCompat.Builder(ctx, CANAL_RESULTADO)
        .setSmallIcon(iconePequeno(ctx))
        .setContentTitle(titulo)
        .setContentText(texto)
        .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setContentIntent(abrirApp(ctx))
        .build()
      try {
        NotificationManagerCompat.from(ctx).notify(ID_RESULTADO, n)
      } catch (_: SecurityException) {}
    }
  }
}
