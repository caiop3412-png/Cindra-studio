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

// ── Pasta pública (/storage/emulated/0/cindra-studio) ──────────────────
// true só se o módulo nativo instalado já tem essas funções (precisa de
// build novo). Com módulo antigo, o JS cai no caminho antigo.
export const temPastaNativa = !!(Nativo && Nativo.criarPasta && Nativo.copiarArquivo && Nativo.copiarSequencial && Nativo.temAcessoTodosArquivos);

// true/false: "Acesso a todos os arquivos" liberado? (Android 11+)
export function temAcessoTodosArquivos() {
  return temPastaNativa ? Nativo.temAcessoTodosArquivos() : Promise.resolve(null);
}

// Abre a tela de acesso a todos os arquivos deste app.
export function abrirAcessoTodosArquivos() {
  return temPastaNativa ? Nativo.abrirAcessoTodosArquivos() : Promise.resolve(false);
}

// Cria a pasta (caminho sem file://). Devolve true se existe e é gravável.
export function criarPasta(caminho) {
  return Nativo.criarPasta(caminho);
}

// Copia origem -> destino. Devolve o caminho final (file://...).
export function copiarArquivo(origem, destino) {
  return Nativo.copiarArquivo(origem, destino);
}

// Copia pra pasta/base-N.apk (N = próximo número livre: 1, 2, 3...).
export function copiarSequencial(origem, pasta, base) {
  return Nativo.copiarSequencial(origem, pasta, base);
}

// ── Pasta "arquivos" de cada app (espelho do projeto) ───────────────────
// true só se o módulo nativo instalado tem essas funções (precisa de build novo).
export const temEspelhoNativo = !!(temPastaNativa && Nativo.espelharProjeto && Nativo.listarPasta && Nativo.lerTextos && Nativo.copiarSobrescrevendo);

// Grava o projeto na pasta. Devolve { agora, escritos }.
export function espelharProjeto(raiz, textos, origemBin, binarios, ultimaSync) {
  return Nativo.espelharProjeto(raiz, textos, origemBin, binarios, ultimaSync || 0);
}

// [{ caminho, tamanho, modificado }] de tudo que está na pasta.
export function listarPasta(raiz) {
  return Nativo.listarPasta(raiz);
}

// { caminho: texto } dos arquivos de texto pedidos.
export function lerTextos(raiz, caminhos) {
  return Nativo.lerTextos(raiz, caminhos);
}

// Copia sobrescrevendo o destino.
export function copiarSobrescrevendo(origem, destino) {
  return Nativo.copiarSobrescrevendo(origem, destino);
}
