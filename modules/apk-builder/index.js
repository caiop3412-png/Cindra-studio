// Ponte JS do módulo nativo apk-builder (compilador de APK no aparelho).
// requireOptionalNativeModule devolve null se o módulo ainda não estiver
// no app instalado (ex: OTA publicado antes do eas build) — assim o app
// NÃO quebra, só avisa que precisa do rebuild.
import { requireOptionalNativeModule } from 'expo-modules-core';

const Nativo = requireOptionalNativeModule('ApkBuilder');

export const disponivel = Nativo != null;

// { aapt2: boolean, sdk: number, abis: string[] }
export function ambiente() {
  return Nativo ? Nativo.ambiente() : Promise.resolve(null);
}

// Extrai o android.jar de dentro do zip da plataforma baixado do Google.
export function extrairAndroidJar(zipPath, destino) {
  return Nativo.extrairAndroidJar(zipPath, destino);
}

// Compila o projeto. Caminhos SEM o prefixo file://.
// Devolve { ok, apk, etapa, erros: [{ arquivo, linha, mensagem }] }
export function compilar(pastaProjeto, androidJar, apkSaida) {
  return Nativo.compilar(pastaProjeto, androidJar, apkSaida);
}

// Abre a tela de instalação do Android. Devolve 'ok' ou 'permissao'
// (quando falta liberar "instalar apps desconhecidos" pro Cindra).
export function instalar(apkPath) {
  return Nativo.instalar(apkPath);
}

// Recebe cada linha de log da compilação. Devolve { remove() }.
export function aoLogar(callback) {
  if (!Nativo) return { remove() {} };
  return Nativo.addListener('onLog', (e) => callback(e.linha));
}
