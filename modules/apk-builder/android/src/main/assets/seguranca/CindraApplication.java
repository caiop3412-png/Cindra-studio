package com.cindrastudio.security;

import android.app.Application;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import java.security.MessageDigest;

// Injetado automaticamente pelo ApkPipeline em todo app gerado pelo
// CindraStudio — não faz parte do projeto do usuário. Roda ANTES de
// qualquer Activity, então não tem como pular chamando outra tela.
public class CindraApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        checarAssinatura();
    }

    private void checarAssinatura() {
        try {
            PackageManager pm = getPackageManager();
            android.content.pm.PackageInfo info = pm.getPackageInfo(
                getPackageName(),
                PackageManager.GET_SIGNING_CERTIFICATES
            );
            Signature[] assinaturas = info.signingInfo.getApkContentsSigners();
            Signature assinatura = assinaturas[0];

            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(assinatura.toByteArray());

            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }

            // Se não bater, verificarAssinatura já mata o processo (abort()
            // do lado nativo) — não precisa de "if" aqui.
            SegurancaNativa.verificarAssinatura(sb.toString());
        } catch (Exception e) {
            // Não deu pra nem calcular a assinatura — algo muito errado
            // (celular com PackageManager quebrado, etc). Trata como
            // adulteração e encerra, em vez de deixar passar.
            android.os.Process.killProcess(android.os.Process.myPid());
        }
    }
}
