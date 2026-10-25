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
// opcoes (opcional): { release: true, keystore, senhaKeystore, alias, senhaChave }
//   - sem release: assina com a chave de debug interna do Cindra
//   - release: assina com o keystore do usuário (.p12/.pfx/.bks, caminho sem file://)
// Devolve { ok, apk, etapa, erros: [{ arquivo, linha, mensagem }] }
let jaVerificouBateria = false;
export async function compilar(pastaProjeto, androidJar, apkSaida, opcoes) {
  // Na primeira compilação do app, pede (uma vez só na vida) pra liberar o
  // app da economia de bateria. Se a pessoa negar, o serviço em primeiro
  // plano ainda segura a compilação na maioria dos aparelhos.
  if (!jaVerificouBateria) {
    jaVerificouBateria = true;
    try { await Nativo.pedirLiberarBateria(); } catch (e) {}
  }
  // sempre manda um objeto no 4º argumento (o módulo nativo espera 4 parâmetros)
  return Nativo.compilar(pastaProjeto, androidJar, apkSaida, opcoes || {});
}

// 'liberado' | 'ja_pediu' | 'aberto' — abre a janelinha do sistema (1 vez só).
export function pedirLiberarBateria() {
  return Nativo ? Nativo.pedirLiberarBateria() : Promise.resolve('indisponivel');
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
