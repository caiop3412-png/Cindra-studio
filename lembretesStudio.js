// Lembretes do Cindra Studio (notificações locais, sem internet):
//  - toda vez que a pessoa sai do app: "Não esqueça do seu projeto <nome>"
//  - todo dia no mesmo horário (HORA_DIARIO), até ela voltar a usar
// O ícone é o assets/notification-icon.png (o plugin do expo-notifications
// no app.json copia ele pro Android). O aviso de "APK pronto" da compilação
// em segundo plano vem do módulo nativo apk-builder, não daqui.
//
// Entra no app só com um import no index.js:  import './lembretesStudio';
import { AppState, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Opcional: se o expo-notifications ainda não estiver no app, não quebra nada.
let Notifications = null;
try { Notifications = require('expo-notifications'); } catch (e) { Notifications = null; }

const ID_SAIDA = 'cindra-lembrete-saida';
const ID_DIARIO = 'cindra-lembrete-diario';
const CANAL = 'lembretes';
const HORA_DIARIO = 20;     // lembrete diário às 20:00
const MINUTO_DIARIO = 0;
// Espera alguns segundos antes de avisar que saiu: abrir o seletor de
// arquivos ou o instalador também "sai" do app, e aí o aviso nem aparece.
const ATRASO_SAIDA_SEG = 20;

const ARQUIVO_LISTA = `${FileSystem.documentDirectory}cindrastudio/_projetos.json`;

// Nome do projeto mais recente (a lista do Studio guarda o último mexido no topo).
async function nomeDoProjeto() {
  try {
    const info = await FileSystem.getInfoAsync(ARQUIVO_LISTA);
    if (!info.exists) return '';
    const texto = await FileSystem.readAsStringAsync(ARQUIVO_LISTA, { encoding: FileSystem.EncodingType.UTF8 });
    const lista = JSON.parse(texto);
    if (!Array.isArray(lista) || !lista.length) return '';
    const maisRecente = lista.reduce((a, p) => ((p.atualizadoEm || 0) > (a.atualizadoEm || 0) ? p : a), lista[0]);
    return String(maisRecente.nomeApp || maisRecente.pacote || '').trim();
  } catch (e) {
    return '';
  }
}

function montarTextos(nome) {
  return nome
    ? { title: `Não esqueça do seu projeto ${nome}`, body: 'Volte pro Cindra Studio e continue de onde parou.' }
    : { title: 'Não esqueça dos seus projetos', body: 'Volte pro Cindra Studio e continue de onde parou.' };
}

function tipoGatilho(nome, padrao) {
  const tipos = Notifications && Notifications.SchedulableTriggerInputTypes;
  return tipos && tipos[nome] ? tipos[nome] : padrao;
}

async function prepararCanal() {
  if (!Notifications || Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Lembretes',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch (e) {}
}

async function garantirPermissao() {
  if (!Notifications) return false;
  try {
    const atual = await Notifications.getPermissionsAsync();
    if (atual.granted) return true;
    if (atual.canAskAgain === false) return false;
    const pedido = await Notifications.requestPermissionsAsync();
    return !!pedido.granted;
  } catch (e) {
    return false;
  }
}

async function agendar(id, nome, gatilho) {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
    const { title, body } = montarTextos(nome);
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: gatilho,
    });
  } catch (e) {}
}

const agendarDiario = (nome) => agendar(ID_DIARIO, nome, {
  type: tipoGatilho('DAILY', 'daily'),
  hour: HORA_DIARIO,
  minute: MINUTO_DIARIO,
  channelId: CANAL,
});

const agendarSaida = (nome) => agendar(ID_SAIDA, nome, {
  type: tipoGatilho('TIME_INTERVAL', 'timeInterval'),
  seconds: ATRASO_SAIDA_SEG,
  channelId: CANAL,
});

let versao = 0; // evita corrida entre "saiu" e "voltou" muito rápidos

async function aoSair() {
  const minha = ++versao;
  const nome = await nomeDoProjeto();
  if (minha !== versao) return; // voltou pro app enquanto lia o nome
  await agendarSaida(nome);
  await agendarDiario(nome);
}

async function aoVoltar() {
  versao += 1;
  try { await Notifications.cancelScheduledNotificationAsync(ID_SAIDA); } catch (e) {}
  try { await Notifications.dismissNotificationAsync(ID_SAIDA); } catch (e) {}
  try { await Notifications.dismissNotificationAsync(ID_DIARIO); } catch (e) {}
  // mantém o diário valendo, já com o nome do projeto mais atual
  agendarDiario(await nomeDoProjeto());
}

let iniciado = false;
export function iniciarLembretesStudio() {
  if (iniciado || !Notifications || Platform.OS !== 'android') return;
  iniciado = true;
  (async () => {
    await prepararCanal();
    const ok = await garantirPermissao();
    if (!ok) return;
    agendarDiario(await nomeDoProjeto());
    AppState.addEventListener('change', (estado) => {
      if (estado === 'background') aoSair();
      else if (estado === 'active') aoVoltar();
    });
  })();
}

iniciarLembretesStudio();
