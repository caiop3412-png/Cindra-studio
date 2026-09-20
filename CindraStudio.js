import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Platform,
  ScrollView,
  Pressable,
  Animated,
  Easing,
  ActivityIndicator,
  AppState,
  Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
// SDK 54: StorageAccessFramework, documentDirectory, writeAsStringAsync etc
// só existem no caminho "legacy".
import * as FileSystem from 'expo-file-system/legacy';
// Módulo nativo local (modules/apk-builder): aapt2 + ECJ + D8 + apksig.
import * as ApkBuilder from './modules/apk-builder';

const COLORS = {
  ink: '#ffffff',
  dim: 'rgba(255,255,255,0.6)',
  line: 'rgba(255,255,255,0.14)',
  lineSoft: 'rgba(255,255,255,0.07)',
  panel: 'rgba(32,14,16,0.6)',
  panel2: '#26100f',
  sheet: '#170c0b',
  ember: '#ff5227',
  emberDeep: '#c81e50',
  emberGlow: 'rgba(255,82,39,0.55)',
  // Núcleo quente do brasido — usado com moderação, só em detalhes de
  // assinatura (contorno do avatar, cursor, badge de destaque), pra dar
  // a sensação de "brasa" (vermelho -> laranja -> dourado) em vez de um
  // laranja chapado só.
  gold: '#ffb648',
  goldGlow: 'rgba(255,182,72,0.35)',
  pink: '#ff2e7e',
  pinkGlow: 'rgba(255,46,126,0.5)',
  error: '#ff6b6b',
  // Mantidos por compatibilidade com estilos que ainda referenciam
  // "blue" — agora apontam pro tom ember pra tudo ficar consistente.
  blue: '#ff5227',
  blueGlow: 'rgba(255,82,39,0.55)',
  // Roxo do "modo dev" — o MESMO tom já usado nos cards/ícones de
  // arquivo de código da Área Dev (#8b5cf6/#a78bfa), reaproveitado aqui
  // pra marcar visualmente qualquer resposta que veio do modo dev
  // (selo na bolha) sem inventar uma cor nova pro app.
  devPurple: '#8b5cf6',
  devPurpleLight: '#a78bfa',
  devPurpleGlow: 'rgba(139,92,246,0.35)',
  devPurpleSoft: 'rgba(139,92,246,0.10)',
  // Azul do "modo pensamento profundo" — mesma ideia do roxo do modo dev
  // (selo/ícone de destaque), só numa cor própria pra diferenciar os dois
  // modos visualmente de relance.
  pensamentoBlue: '#4fa3f7',
  pensamentoBlueLight: '#7ebdfa',
  pensamentoBlueGlow: 'rgba(79,163,247,0.35)',
  pensamentoBlueSoft: 'rgba(79,163,247,0.10)',
};

function hexParaRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─────────────────────────────────────────────────────────
// Aviso global (card no topo que some sozinho) — usado pelo Studio.
// ─────────────────────────────────────────────────────────
let noticeListener = null;
function exibirAviso(titulo, mensagem = '', tipo = 'aviso') {
  if (noticeListener) noticeListener({ titulo, mensagem, tipo, key: Date.now() });
}

function NoticeCardHost() {
  const insets = useSafeAreaInsets();
  const [aviso, setAviso] = useState(null); // { titulo, mensagem, tipo, key } | null
  const anim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  useEffect(() => {
    noticeListener = (novoAviso) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setAviso(novoAviso);
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      timerRef.current = setTimeout(() => {
        Animated.timing(anim, {
          toValue: 0,
          duration: 320,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(() => setAviso(null));
      }, 4200);
    };
    return () => {
      noticeListener = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!aviso) return null;

  // Cada tipo tem um ícone e uma cor de destaque — "erro" em vermelho
  // (falhas de verdade), "sucesso" em dourado com check (ação concluída),
  // "aviso" em dourado neutro (bloqueios, permissão, validação).
  const ESTILO_POR_TIPO = {
    erro: { icon: 'alert-circle', cor: COLORS.error, badge: 'rgba(255,107,107,0.14)' },
    sucesso: { icon: 'check-circle', cor: COLORS.gold, badge: 'rgba(255,182,72,0.14)' },
    aviso: { icon: 'information', cor: COLORS.gold, badge: 'rgba(255,182,72,0.14)' },
  };
  const est = ESTILO_POR_TIPO[aviso.tipo] || ESTILO_POR_TIPO.aviso;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.noticeCardWrap,
        {
          top: insets.top + 8,
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) },
          ],
        },
      ]}
    >
      <View style={styles.noticeCard}>
        <View style={[styles.noticeIconBadge, { backgroundColor: est.badge }]}>
          <MaterialCommunityIcons name={est.icon} size={17} color={est.cor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.noticeTitle}>{aviso.titulo}</Text>
          {!!aviso.mensagem && (
            <Text style={styles.noticeMessage} numberOfLines={4}>
              {aviso.mensagem}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// Estilos compartilhados que o Studio usava do `styles` do Cindra-AI.
const styles = StyleSheet.create({
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'transparent',
  },
  chatHeaderTitle: {
    color: COLORS.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  noticeCardWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    alignItems: 'center',
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    backgroundColor: '#211412',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  noticeIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  noticeTitle: {
    color: COLORS.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  noticeMessage: {
    color: COLORS.dim,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
});

// ─────────────────────────────────────────────────────────
// CindraStudio — helpers de projeto (fora do componente pra não recriar
// a cada render). Gera a estrutura de pastas/arquivos de um projeto
// Android novo, do jeito que o CodeAssist organiza (app/src/main/...),
// já preenchida com um esqueleto em branco (Activity simples, sem HTML), pronto
// pra IA (ou o próprio usuário) editar em cima.
// ─────────────────────────────────────────────────────────
function pacotePraCaminho(pkg) {
  return String(pkg || 'com.exemplo.app').trim().replace(/[^a-zA-Z0-9.]/g, '').split('.').filter(Boolean).join('/') || 'com/exemplo/app';
}

// Ícones disponíveis pro seletor de "ícone do app" na tela de config.
const ICONES_APP_STUDIO = [
  'android', 'sword-cross', 'gamepad-variant', 'rocket-launch-outline',
  'shield-star-outline', 'skull-crossbones-outline', 'castle', 'fire',
  'water', 'earth', 'star-four-points-outline', 'controller-classic-outline',
  'ghost-outline', 'diamond-stone', 'chess-knight', 'lightning-bolt-outline',
];
const CORES_ICONE_STUDIO = ['#ff5227', '#8b5cf6', '#38bdf8', '#34d399', '#ffb648', '#ff2e7e', '#eab308', '#60a5fa'];

// Ícone + cor por extensão de arquivo, pro explorador do CindraStudio
// (parecido com iconeArquivo(), só que cobrindo extensões de projeto
// Android — .java, .xml, .gradle — que a Biblioteca não usa).
function iconeArquivoStudio(nome) {
  const ext = String(nome || '').split('.').pop().toLowerCase();
  const MAPA = {
    java: { icon: 'language-java', color: '#f89820' },
    kt: { icon: 'language-kotlin', color: '#7f52ff' },
    xml: { icon: 'code-tags', color: '#00acc1' },
    html: { icon: 'language-html5', color: '#ff6b4a' },
    glb: { icon: 'cube-outline', color: '#38bdf8' },
    gltf: { icon: 'cube-outline', color: '#38bdf8' },
    obj: { icon: 'cube-outline', color: '#38bdf8' },
    png: { icon: 'file-image-outline', color: '#a78bfa' },
    jpg: { icon: 'file-image-outline', color: '#a78bfa' },
    jpeg: { icon: 'file-image-outline', color: '#a78bfa' },
    mp3: { icon: 'music-note-outline', color: '#f472b6' },
    ogg: { icon: 'music-note-outline', color: '#f472b6' },
    wav: { icon: 'music-note-outline', color: '#f472b6' },
    gradle: { icon: 'cog-outline', color: '#34d399' },
    json: { icon: 'code-tags', color: COLORS.ember },
  };
  return MAPA[ext] || { icon: 'file-document-outline', color: COLORS.dim };
}

// SDK do projeto gerado — vale pro <uses-sdk> do manifest e pro
// build.gradle. O targetSdk tem que bater com o android.jar que o
// compilador nativo (próxima etapa) vai usar.
const STUDIO_MIN_SDK = 21;
const STUDIO_TARGET_SDK = 35;

// android.jar (stubs da API do Android, só pra compilar) — baixado UMA vez
// do repositório oficial do Google, na primeira compilação. O zip tem uns
// 60 MB; o módulo nativo extrai só o android.jar e o zip é apagado.
const STUDIO_PLATFORM_ZIP_URL = 'https://dl.google.com/android/repository/platform-35_r01.zip';

// file:///data/... -> /data/... (o módulo nativo usa caminho puro).
function caminhoLocalStudio(uri) {
  return String(uri).replace(/^file:\/\//, '');
}

async function garantirAndroidJarStudio(aoProgredir) {
  const pasta = `${FileSystem.documentDirectory}cindrastudio/_tools/`;
  const jar = `${pasta}android-${STUDIO_TARGET_SDK}.jar`;
  const info = await FileSystem.getInfoAsync(jar);
  if (info.exists && info.size > 5 * 1024 * 1024) return caminhoLocalStudio(jar);

  await FileSystem.makeDirectoryAsync(pasta, { intermediates: true });
  const zip = `${pasta}platform.zip`;
  const download = FileSystem.createDownloadResumable(STUDIO_PLATFORM_ZIP_URL, zip, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) aoProgredir(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const resposta = await download.downloadAsync();
  if (!resposta || resposta.status !== 200) {
    throw new Error(`Falha ao baixar o android.jar (status ${resposta ? resposta.status : 'sem resposta'})`);
  }
  await ApkBuilder.extrairAndroidJar(caminhoLocalStudio(zip), caminhoLocalStudio(jar));
  await FileSystem.deleteAsync(zip, { idempotent: true });
  return caminhoLocalStudio(jar);
}

// Nome de pacote válido pro Android: minúsculo, só letras/números/_ e
// pontos, pelo menos 2 partes, nenhuma parte começando com número.
function normalizarPacote(pkg) {
  const partes = String(pkg || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .split('.')
    .filter(Boolean)
    .map((p) => (/^[0-9]/.test(p) ? `a${p}` : p));
  return partes.length >= 2 ? partes.join('.') : 'com.dev.meuapp';
}

// O nome do app entra dentro de XML/HTML — sem escapar, um "&" ou "<"
// no nome quebra o strings.xml e o aapt2 recusa o projeto.
function escaparXml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// strings.xml tem uma regra a mais: aspas simples precisam de barra.
function escaparStringAndroid(texto) {
  return escaparXml(texto).replace(/'/g, "\\'");
}

// Monta a árvore (pra o explorador) e o conteúdo inicial (pra o editor)
// de um projeto novo, a partir do nome do app, do nome do pacote e da
// cor do ícone. Já gera tudo que o manifest referencia (tema, ícone,
// <uses-sdk>), senão o aapt2 recusa o projeto na hora de compilar.
function montarProjetoNovo(nomeApp, nomePacoteBruto, corIcone) {
  const nomePacote = normalizarPacote(nomePacoteBruto);
  const cor = /^#[0-9a-fA-F]{6}$/.test(corIcone || '') ? corIcone : '#ff5227';
  const pkgPath = pacotePraCaminho(nomePacote);
  const manifestPath = 'app/src/main/AndroidManifest.xml';
  const mainActivityPath = `app/src/main/java/${pkgPath}/MainActivity.java`;
  const stringsPath = 'app/src/main/res/values/strings.xml';
  const stylesPath = 'app/src/main/res/values/styles.xml';
  const iconePath = 'app/src/main/res/drawable/ic_launcher.xml';
  const gradlePath = 'app/build.gradle';

  const conteudos = {
    [manifestPath]: `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${nomePacote}">

    <uses-sdk
        android:minSdkVersion="${STUDIO_MIN_SDK}"
        android:targetSdkVersion="${STUDIO_TARGET_SDK}" />

    <!-- Permissões entram aqui. Exemplo:
    <uses-permission android:name="android.permission.INTERNET" />
    -->

    <application
        android:allowBackup="true"
        android:icon="@drawable/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.App">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="landscape"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>

    </application>
</manifest>
`,
    [mainActivityPath]: `package ${nomePacote};

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

// Projeto novo, em branco. Edite este arquivo pra criar seu app:
// a tela é montada aqui mesmo em código (sem XML e sem HTML).
public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        TextView texto = new TextView(this);
        texto.setText("Seu projeto está pronto.\\nEdite o MainActivity.java pra começar.");
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(18);
        texto.setGravity(Gravity.CENTER);
        texto.setBackgroundColor(Color.parseColor("#03050a"));

        setContentView(texto);
    }
}
`,
    [stringsPath]: `<resources>
    <string name="app_name">${escaparStringAndroid(nomeApp)}</string>
</resources>
`,
    [stylesPath]: `<resources>
    <style name="Theme.App" parent="android:Theme.Material.NoActionBar" />
</resources>
`,
    // Ícone em vetor (XML) — dispensa gerar PNG. Por enquanto é um
    // quadrado arredondado na cor escolhida com um círculo branco; o
    // símbolo escolhido na config ainda não é desenhado aqui.
    [iconePath]: `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor="${cor}"
        android:pathData="M24,0 H84 A24,24 0 0 1 108,24 V84 A24,24 0 0 1 84,108 H24 A24,24 0 0 1 0,84 V24 A24,24 0 0 1 24,0 Z" />
    <path
        android:fillColor="#FFFFFF"
        android:pathData="M54,30 A24,24 0 1 1 54,78 A24,24 0 1 1 54,30 Z" />
</vector>
`,
    [gradlePath]: `// build.gradle gerado pelo CindraStudio
android {
    namespace '${nomePacote}'
    compileSdk ${STUDIO_TARGET_SDK}
    defaultConfig {
        applicationId "${nomePacote}"
        minSdk ${STUDIO_MIN_SDK}
        targetSdk ${STUDIO_TARGET_SDK}
        versionCode 1
        versionName "1.0"
    }
}
`,
  };

  // Transforma o mapa de caminhos num array de nós (pastas/arquivos)
  // pro explorador desenhar em árvore.
  const raiz = [];
  Object.keys(conteudos).forEach((caminho) => {
    const partes = caminho.split('/');
    let nivel = raiz;
    let acumulado = '';
    partes.forEach((parte, i) => {
      acumulado = acumulado ? `${acumulado}/${parte}` : parte;
      const ehArquivo = i === partes.length - 1;
      let no = nivel.find((n) => n.nome === parte && n.tipo === (ehArquivo ? 'arquivo' : 'pasta'));
      if (!no) {
        no = { nome: parte, caminho: acumulado, tipo: ehArquivo ? 'arquivo' : 'pasta', filhos: ehArquivo ? undefined : [] };
        nivel.push(no);
      }
      if (!ehArquivo) nivel = no.filhos;
    });
  });

  // Pasta assets já aparece (vazia) no explorador: é onde a pessoa segura o
  // dedo pra "Adicionar arquivo" (modelo .glb, imagem, som...).
  const arvore = inserirNoNaArvore(raiz, 'app/src/main', { nome: 'assets', caminho: ASSETS_STUDIO, tipo: 'pasta', filhos: [] });
  return { arvore, conteudos, binarios: {}, arquivoInicial: mainActivityPath, pacote: nomePacote };
}

// Pasta do projeto no armazenamento interno do app — é daqui que o
// compilador nativo (próxima etapa) vai ler os arquivos.
function pastaProjetoStudio(pacote) {
  return `${FileSystem.documentDirectory}cindrastudio/${pacote}/`;
}

// Grava o projeto inteiro em disco, um arquivo por caminho. Apaga a
// pasta antes pra arquivo removido/renomeado não ficar sobrando lá.
async function gravarProjetoStudio(projeto) {
  const base = pastaProjetoStudio(projeto.pacote);
  await FileSystem.deleteAsync(base, { idempotent: true });
  const caminhos = Object.keys(projeto.conteudos);
  for (const caminho of caminhos) {
    const pasta = base + caminho.split('/').slice(0, -1).join('/');
    await FileSystem.makeDirectoryAsync(pasta, { intermediates: true });
    await FileSystem.writeAsStringAsync(base + caminho, projeto.conteudos[caminho], {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
  // A pasta assets sempre existe no disco (mesmo vazia), como no molde antigo.
  await FileSystem.makeDirectoryAsync(base + ASSETS_STUDIO, { intermediates: true });
  // Arquivos binários (.glb, imagens, sons) ficam guardados à parte em
  // _bin/ e são copiados pro lugar certo a cada gravação.
  const binarios = projeto.binarios || {};
  for (const caminho of Object.keys(binarios)) {
    const pasta = base + caminho.split('/').slice(0, -1).join('/');
    await FileSystem.makeDirectoryAsync(pasta, { intermediates: true });
    await FileSystem.copyAsync({ from: pastaBinariosStudio(projeto.pacote) + caminho, to: base + caminho });
  }
  return base;
}

// Onde os arquivos binários do projeto ficam guardados de verdade.
function pastaBinariosStudio(pacote) {
  return `${FileSystem.documentDirectory}cindrastudio/_bin/${pacote}/`;
}

const ASSETS_STUDIO = 'app/src/main/assets';

// Insere um nó (pasta ou arquivo) dentro da pasta `pastaCaminho`, sem
// mexer na árvore original (devolve uma nova).
function inserirNoNaArvore(nos, pastaCaminho, novo) {
  return nos.map((no) => {
    if (no.tipo !== 'pasta') return no;
    if (no.caminho === pastaCaminho) return { ...no, filhos: no.filhos.concat(novo) };
    return { ...no, filhos: inserirNoNaArvore(no.filhos, pastaCaminho, novo) };
  });
}

function removerNoDaArvore(nos, caminho) {
  return nos
    .filter((no) => no.caminho !== caminho)
    .map((no) => (no.tipo === 'pasta' ? { ...no, filhos: removerNoDaArvore(no.filhos, caminho) } : no));
}

function arvoreTemCaminho(nos, caminho) {
  return nos.some((no) => no.caminho === caminho || (no.tipo === 'pasta' && arvoreTemCaminho(no.filhos, caminho)));
}

// Estado do CindraStudio salvo em disco. Agora dá pra ter VÁRIOS projetos:
// um índice leve (_projetos.json — nome, pacote, ícone, cor) alimenta a
// tela inicial, e cada projeto tem seu próprio arquivo completo (arquivos,
// abas abertas...) em _estados/<pacote>.json, lido só quando a pessoa abre
// aquele projeto específico.
const PASTA_ESTADOS_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_estados/`;
const ARQUIVO_LISTA_PROJETOS_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_projetos.json`;
// Versão antiga (1 projeto só, sem tela inicial) guardava tudo aqui —
// migrado automaticamente na primeira abertura depois do update.
const ARQUIVO_ESTADO_ANTIGO_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_estado.json`;

function caminhoEstadoProjeto(pacote) {
  return `${PASTA_ESTADOS_STUDIO}${pacote}.json`;
}

async function lerListaProjetosStudio() {
  try {
    const info = await FileSystem.getInfoAsync(ARQUIVO_LISTA_PROJETOS_STUDIO);
    if (!info.exists) return [];
    const texto = await FileSystem.readAsStringAsync(ARQUIVO_LISTA_PROJETOS_STUDIO, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const lista = JSON.parse(texto);
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
}

async function gravarListaProjetosStudio(lista) {
  await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}cindrastudio/`, { intermediates: true });
  await FileSystem.writeAsStringAsync(ARQUIVO_LISTA_PROJETOS_STUDIO, JSON.stringify(lista), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

// Cria (ou atualiza, se o pacote já existir) a entrada de um projeto na
// lista, sempre trazendo ele pro topo. Preserva o "favorito" que já
// existia (essa função só atualiza nome/ícone/data). Devolve a lista
// nova já gravada.
async function atualizarListaProjetosStudio(resumo) {
  const lista = await lerListaProjetosStudio();
  const existente = lista.find((p) => p.pacote === resumo.pacote);
  const semEle = lista.filter((p) => p.pacote !== resumo.pacote);
  const nova = [{ favorito: false, ...existente, ...resumo, atualizadoEm: Date.now() }, ...semEle];
  await gravarListaProjetosStudio(nova);
  return nova;
}

// Texto tipo "há 2h", "há 3d" a partir de um timestamp — usado nos cards
// da tela inicial pra mostrar quando cada projeto foi mexido por último.
function tempoRelativoStudio(ms) {
  if (!ms) return '';
  const diffMin = Math.floor((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d}d`;
  return `há ${Math.floor(d / 7)}sem`;
}

async function removerDaListaProjetosStudio(pacote) {
  const lista = await lerListaProjetosStudio();
  const nova = lista.filter((p) => p.pacote !== pacote);
  await gravarListaProjetosStudio(nova);
  return nova;
}

async function lerEstadoStudio(pacote) {
  try {
    const caminho = caminhoEstadoProjeto(pacote);
    const info = await FileSystem.getInfoAsync(caminho);
    if (!info.exists) return null;
    const texto = await FileSystem.readAsStringAsync(caminho, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const estado = JSON.parse(texto);
    if (!estado || !estado.projeto || !estado.projeto.conteudos || !estado.projeto.arvore) return null;
    return estado;
  } catch (e) {
    return null;
  }
}

async function gravarEstadoStudio(estado) {
  await FileSystem.makeDirectoryAsync(PASTA_ESTADOS_STUDIO, { intermediates: true });
  await FileSystem.writeAsStringAsync(caminhoEstadoProjeto(estado.nomePacote), JSON.stringify(estado), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

// Migração de versão antiga: se existir o arquivo único de antes (sem
// tela inicial), vira o primeiro item da lista nova e some.
async function migrarEstadoAntigoStudio() {
  try {
    const info = await FileSystem.getInfoAsync(ARQUIVO_ESTADO_ANTIGO_STUDIO);
    if (!info.exists) return;
    const texto = await FileSystem.readAsStringAsync(ARQUIVO_ESTADO_ANTIGO_STUDIO, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const estado = JSON.parse(texto);
    if (estado && estado.projeto && estado.nomePacote) {
      await gravarEstadoStudio(estado);
      await atualizarListaProjetosStudio({
        pacote: estado.nomePacote,
        nomeApp: estado.nomeApp || 'Meu App',
        iconeEscolhido: estado.iconeEscolhido || ICONES_APP_STUDIO[0],
        corIcone: estado.corIcone || CORES_ICONE_STUDIO[0],
      });
    }
  } catch (e) {
    // se der ruim, só não migra — não trava a tela inicial por causa disso.
  } finally {
    FileSystem.deleteAsync(ARQUIVO_ESTADO_ANTIGO_STUDIO, { idempotent: true }).catch(() => {});
  }
}

const studioStyles = StyleSheet.create({
  cardAcao: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '32%',
    backgroundColor: '#141418',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 16,
  },
  cardAcaoTitulo: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  cardAcaoCaminho: { color: COLORS.dim, fontSize: 11.5, marginTop: 3, marginBottom: 14 },
  cardAcaoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cardAcaoBtnText: { color: COLORS.ink, fontSize: 14, fontWeight: '600' },
  novoProjBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  novoProjText: { color: COLORS.dim, fontSize: 13, fontWeight: '600' },
  compilePanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '62%',
    backgroundColor: '#0d0d10',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  logLinha: { color: COLORS.dim, fontSize: 12, lineHeight: 18, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Menlo' },
  erroCard: {
    backgroundColor: 'rgba(255,90,78,0.10)',
    borderColor: 'rgba(255,90,78,0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  erroArquivo: { color: '#ff8a80', fontSize: 11.5, fontWeight: '700', marginBottom: 3 },
  erroMensagem: { color: COLORS.ink, fontSize: 12.5, lineHeight: 17 },
  instalarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#8bd450',
    borderRadius: 14,
    paddingVertical: 13,
    marginHorizontal: 14,
    marginTop: 4,
  },
  instalarBtnText: { color: '#1a0806', fontSize: 14.5, fontWeight: '700' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0d0d0f',
  },
  topBarTitle: { flex: 1, color: '#e8efe9', fontSize: 15, fontWeight: '700', marginLeft: 10 },
  topBarIconBtn: { padding: 6, marginLeft: 4 },
  tabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#111113',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.06)',
  },
  tabAtiva: { backgroundColor: 'rgba(255,82,39,0.14)', borderBottomWidth: 2, borderBottomColor: COLORS.ember },
  tabText: { color: COLORS.dim, fontSize: 12.5, maxWidth: 130 },
  tabTextAtiva: { color: COLORS.ink, fontWeight: '700' },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#0a0a0c',
  },
  breadcrumbText: { color: COLORS.dim, fontSize: 11.5 },
  editorRow: { flexDirection: 'row', minHeight: '100%' },
  lineNumbers: { paddingVertical: 12, paddingHorizontal: 8, backgroundColor: '#0a0a0c' },
  lineNumberText: { color: 'rgba(255,255,255,0.28)', fontSize: 13, lineHeight: 20, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'right' },
  codeInput: {
    flex: 1,
    color: '#d4d4d4',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingVertical: 12,
    paddingHorizontal: 10,
    textAlignVertical: 'top',
  },
  emptyEditor: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  sidebarBackdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sidebarPanel: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '78%', maxWidth: 320, backgroundColor: '#0d0d0f', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)' },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  sidebarTitle: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  treeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingRight: 12 },
  treeText: { color: COLORS.ink, fontSize: 13 },
  cfgLabel: { color: COLORS.dim, fontSize: 12.5, fontWeight: '700', marginBottom: 8, marginTop: 20, textTransform: 'uppercase', letterSpacing: 0.5 },
  cfgInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.ink,
    fontSize: 14.5,
  },
  cfgHint: { color: COLORS.dim, fontSize: 11.5, marginTop: 6, lineHeight: 15 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  iconOption: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.05)' },
  iconOptionAtiva: { borderColor: COLORS.ink },
  colorRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  colorDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'transparent' },
  colorDotAtiva: { borderColor: '#fff' },
  previewCard: { alignItems: 'center', marginTop: 24, marginBottom: 8 },
  previewIcon: { width: 76, height: 76, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  previewName: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  previewPkg: { color: COLORS.dim, fontSize: 12, marginTop: 2 },
  criarBtn: {
    backgroundColor: COLORS.ember,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 28,
  },
  criarBtnText: { color: '#1a0806', fontSize: 15, fontWeight: '700' },
  // Tela inicial (lista de projetos)
  homeGlowTop: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.emberGlow,
    opacity: 0.16,
  },
  homeGlowBottom: {
    position: 'absolute',
    bottom: -110,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: COLORS.pinkGlow,
    opacity: 0.10,
  },
  homeVazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  homeVazioIcone: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: 'rgba(255,82,39,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  homeVazioTitulo: { color: COLORS.ink, fontSize: 16, fontWeight: '700', marginBottom: 6 },
  homeVazioTexto: { color: COLORS.dim, fontSize: 13.5, textAlign: 'center', lineHeight: 19 },
  // Cabeçalho: título grande + lupa (a lupa vira barra de busca ao tocar).
  homeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 6,
    minHeight: 66,
  },
  homeTitulo: { flex: 1, color: COLORS.ink, fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  homeIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBuscaPilula: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  buscaInput: {
    flex: 1,
    color: COLORS.ink,
    fontSize: 15,
    paddingVertical: 0,
  },
  // Botão grande "Novo projeto" + botão ⋮
  homeAcoes: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 10 },
  homeBtnNovo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 58,
    paddingHorizontal: 22,
    borderRadius: 22,
    backgroundColor: COLORS.ember,
  },
  homeBtnNovoText: { color: '#1a0806', fontSize: 16, fontWeight: '700' },
  homeBtnMais: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Chips de filtro (Projetos / Favoritos) com contador
  homeChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 20, marginBottom: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipAtivo: { backgroundColor: 'rgba(255,82,39,0.22)' },
  chipTexto: { color: COLORS.dim, fontSize: 14, fontWeight: '600' },
  chipTextoAtivo: { color: '#ff8a68' },
  chipContador: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipContadorAtivo: { backgroundColor: COLORS.ember },
  chipContadorTexto: { color: COLORS.dim, fontSize: 12, fontWeight: '700' },
  chipContadorTextoAtivo: { color: '#1a0806' },
  // Card de projeto
  projCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 22,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 6,
    marginBottom: 10,
  },
  projIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  projNome: { color: COLORS.ink, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  projPacote: { color: COLORS.dim, fontSize: 12, marginTop: 3 },
  projMais: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  // Card "Continue de onde parou"
  continuarCard: { backgroundColor: '#4a1a26', borderRadius: 28, padding: 20, marginTop: 18 },
  continuarTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  continuarTitulo: { color: '#ffdcd2', fontSize: 17, fontWeight: '700' },
  continuarSub: { color: 'rgba(255,220,210,0.7)', fontSize: 13.5, marginBottom: 16 },
  continuarBtn: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: '#ffdcd2',
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 24,
  },
  continuarBtnText: { color: '#4a1a26', fontSize: 15, fontWeight: '700' },
  // Aviso "projetos de versão antiga"
  avisoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  avisoTexto: { flex: 1, color: COLORS.ink, fontSize: 14.5, lineHeight: 20 },
  avisoBtn: { backgroundColor: '#ffdcd2', paddingVertical: 11, paddingHorizontal: 16, borderRadius: 20 },
  avisoBtnText: { color: '#4a1a26', fontSize: 14, fontWeight: '700' },
  // Card de anúncio / apoio
  anuncioCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 22,
    padding: 12,
    marginTop: 4,
    marginBottom: 6,
  },
  anuncioTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  anuncioTagTexto: { color: COLORS.dim, fontSize: 12.5, fontWeight: '600' },
  anuncioLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  anuncioIcone: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,182,72,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  anuncioTitulo: { color: COLORS.ink, fontSize: 16, fontWeight: '700' },
  anuncioSub: { color: COLORS.dim, fontSize: 13, marginTop: 2 },
  // Barra de baixo
  navHome: {
    flexDirection: 'row',
    backgroundColor: '#211210',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
    paddingTop: 12,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 4 },
  navPilula: { width: 64, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  navPilulaAtiva: { backgroundColor: 'rgba(255,82,39,0.22)' },
  navRotulo: { color: COLORS.dim, fontSize: 12, fontWeight: '600' },
  navRotuloAtivo: { color: COLORS.ink, fontWeight: '700' },
});

// Nó recursivo do explorador de arquivos (pastas expansíveis + arquivos
// clicáveis, igual à estrutura "app > src > main > java > ... > MainActivity.java"
// que aparece no CodeAssist).
function NoArvoreArquivo({ no, profundidade, pastasAbertas, alternarPasta, arquivoAtivo, onAbrirArquivo, aoSegurar }) {
  if (no.tipo === 'pasta') {
    const aberta = !!pastasAbertas[no.caminho];
    return (
      <View>
        <TouchableOpacity
          onPress={() => alternarPasta(no.caminho)}
          onLongPress={() => aoSegurar && aoSegurar(no)}
          delayLongPress={350}
          style={[studioStyles.treeRow, { paddingLeft: 14 + profundidade * 16 }]}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name={aberta ? 'chevron-down' : 'chevron-right'} size={14} color={COLORS.dim} style={{ marginRight: 2 }} />
          <MaterialCommunityIcons name={aberta ? 'folder-open' : 'folder'} size={16} color={COLORS.ember} style={{ marginRight: 8, marginLeft: 2 }} />
          <Text style={studioStyles.treeText}>{no.nome}</Text>
        </TouchableOpacity>
        {aberta && no.filhos.map((filho) => (
          <NoArvoreArquivo
            key={filho.caminho}
            no={filho}
            profundidade={profundidade + 1}
            pastasAbertas={pastasAbertas}
            alternarPasta={alternarPasta}
            arquivoAtivo={arquivoAtivo}
            onAbrirArquivo={onAbrirArquivo}
            aoSegurar={aoSegurar}
          />
        ))}
      </View>
    );
  }
  const ativo = no.caminho === arquivoAtivo;
  const { icon, color } = iconeArquivoStudio(no.nome);
  return (
    <TouchableOpacity
      onPress={() => onAbrirArquivo(no.caminho)}
      onLongPress={() => aoSegurar && aoSegurar(no)}
      delayLongPress={350}
      style={[studioStyles.treeRow, { paddingLeft: 32 + profundidade * 16, backgroundColor: ativo ? 'rgba(255,82,39,0.12)' : 'transparent' }]}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons name={icon} size={16} color={color} style={{ marginRight: 8 }} />
      <Text style={[studioStyles.treeText, ativo && { color: COLORS.ink, fontWeight: '700' }]}>{no.nome}</Text>
    </TouchableOpacity>
  );
}

// Tela "CindraStudio" — aberta pelo botão logo abaixo da Biblioteca no
// menu lateral. Fluxo: 1) tela de config (nome do app, pacote, ícone) →
// 2) workspace com explorador de arquivos + editor com abas, no mesmo
// espírito visual do CodeAssist. O botão ▶ grava o projeto em disco
// (gravarProjetoStudio) e compila de verdade pelo módulo nativo
// apk-builder (AAPT2 + ECJ + D8 + apksig), mostrando log e erros num
// painel; depois dá pra instalar o APK gerado.
// Link do card "Gostando do CindraStudio?". Deixe vazio pra mostrar só o
// aviso "em breve" ao tocar; coloque a URL (site, Instagram, Pix...) pra abrir.
const STUDIO_LINK_APOIO = '';

// Abas da barra de baixo da tela inicial. Só "projetos" tem conteúdo por
// enquanto — as outras mostram uma tela de "em breve".
const ABAS_HOME_STUDIO = [
  { id: 'projetos', rotulo: 'Projetos', icone: 'folder-open-outline', iconeAtivo: 'folder-open' },
  { id: 'explorar', rotulo: 'Explorar', icone: 'search-web', iconeAtivo: 'search-web' },
  { id: 'aprender', rotulo: 'Aprender', icone: 'school-outline', iconeAtivo: 'school' },
  { id: 'daily', rotulo: 'Daily', icone: 'lightning-bolt-outline', iconeAtivo: 'lightning-bolt' },
];

// Preferências pequenas da tela inicial (ex.: aviso já dispensado).
const ARQUIVO_PREFS_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_prefs.json`;

async function lerPrefsStudio() {
  try {
    const info = await FileSystem.getInfoAsync(ARQUIVO_PREFS_STUDIO);
    if (!info.exists) return {};
    const texto = await FileSystem.readAsStringAsync(ARQUIVO_PREFS_STUDIO, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const obj = JSON.parse(texto);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) {
    return {};
  }
}

async function gravarPrefsStudio(prefs) {
  try {
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}cindrastudio/`, { intermediates: true });
    await FileSystem.writeAsStringAsync(ARQUIVO_PREFS_STUDIO, JSON.stringify(prefs), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (e) {}
}

function CindraStudioScreen({ visible, onClose }) {
  const insets = useSafeAreaInsets();

  const [etapa, setEtapa] = useState('home'); // 'home' | 'config' | 'workspace'
  const [nomeApp, setNomeApp] = useState('Meu App');
  const [nomePacote, setNomePacote] = useState('com.dev.meuapp');
  const [iconeEscolhido, setIconeEscolhido] = useState(ICONES_APP_STUDIO[0]);
  const [corIcone, setCorIcone] = useState(CORES_ICONE_STUDIO[0]);

  // Tela inicial: lista de projetos já criados (resumo — nome, pacote,
  // ícone, cor). O conteúdo completo de cada um só é lido quando a
  // pessoa toca pra abrir.
  const [listaProjetos, setListaProjetos] = useState([]);
  const [cardProjeto, setCardProjeto] = useState(null); // projeto segurado (card de ação)
  const [buscaProjeto, setBuscaProjeto] = useState('');
  const [buscaAberta, setBuscaAberta] = useState(false); // lupa do topo → vira barra de busca
  const [filtroProjetos, setFiltroProjetos] = useState('todos'); // 'todos' | 'favoritos'
  const [ordenacao, setOrdenacao] = useState('recentes'); // 'recentes' | 'nome'
  const [menuMaisAberto, setMenuMaisAberto] = useState(false); // botão ⋮ ao lado de "Novo projeto"
  const [abaHome, setAbaHome] = useState('projetos'); // barra de baixo da tela inicial
  const [avisoRecuperarVisivel, setAvisoRecuperarVisivel] = useState(false); // só depois de ler as prefs
  const prefsRef = useRef({});

  const [projeto, setProjeto] = useState(null); // { arvore, conteudos, arquivoInicial }
  const [pastasAbertas, setPastasAbertas] = useState({});
  const [abasAbertas, setAbasAbertas] = useState([]); // array de caminhos
  const [arquivoAtivo, setArquivoAtivo] = useState(null);
  const [sidebarAberta, setSidebarAberta] = useState(false);

  // Compilação (▶)
  const [compilando, setCompilando] = useState(false);
  const [painelCompilacao, setPainelCompilacao] = useState(false);
  const [logCompilacao, setLogCompilacao] = useState([]);
  const [errosCompilacao, setErrosCompilacao] = useState([]);
  const [apkGerado, setApkGerado] = useState(null);

  // Persistência: o projeto (arquivos, abas, nome, ícone) fica salvo em
  // disco e volta sozinho na próxima vez que abrir a tela — mesmo depois de
  // fechar o app. Só começa do zero se a pessoa tocar em "Novo projeto".
  const [estadoCarregado, setEstadoCarregado] = useState(false);
  const [confirmandoNovo, setConfirmandoNovo] = useState(false);
  const [cardNo, setCardNo] = useState(null); // pasta/arquivo segurado (card de ação)
  const estadoRef = useRef(null);

  // Lê as preferências da tela inicial (aviso de recuperação dispensado ou não).
  useEffect(() => {
    let vivo = true;
    lerPrefsStudio().then((prefs) => {
      if (!vivo) return;
      prefsRef.current = prefs;
      setAvisoRecuperarVisivel(!prefs.avisoRecuperarDispensado);
    });
    return () => { vivo = false; };
  }, []);

  // Ao abrir o app: migra o projeto único de versões antigas (se existir)
  // e carrega a lista de projetos pra tela inicial. Não entra direto em
  // nenhum projeto — quem escolhe é a pessoa, na lista.
  useEffect(() => {
    let vivo = true;
    migrarEstadoAntigoStudio()
      .then(() => lerListaProjetosStudio())
      .then((lista) => {
        if (!vivo) return;
        setListaProjetos(lista);
        setEstadoCarregado(true);
      });
    return () => { vivo = false; };
  }, []);

  // Foto do estado atual (só existe depois de carregar e com projeto criado).
  estadoRef.current = estadoCarregado && projeto
    ? { versao: 1, nomeApp, nomePacote, iconeEscolhido, corIcone, projeto, pastasAbertas, abasAbertas, arquivoAtivo }
    : null;

  // Salva sozinho, meio segundo depois da última mudança (digitar, abrir
  // aba, criar projeto...).
  useEffect(() => {
    if (!estadoRef.current) return undefined;
    const t = setTimeout(() => {
      if (estadoRef.current) gravarEstadoStudio(estadoRef.current).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [estadoCarregado, projeto, pastasAbertas, abasAbertas, arquivoAtivo, nomeApp, nomePacote, iconeEscolhido, corIcone]);

  // Salva na hora quando o app vai pra segundo plano (não perde nada se o
  // sistema matar o app logo em seguida).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estadoApp) => {
      if (estadoApp !== 'active' && estadoRef.current) {
        gravarEstadoStudio(estadoRef.current).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Fechar a tela NÃO apaga o projeto: só fecha os painéis e salva na hora.
  useEffect(() => {
    if (!visible) {
      setSidebarAberta(false);
      setPainelCompilacao(false);
      if (estadoRef.current) gravarEstadoStudio(estadoRef.current).catch(() => {});
    }
  }, [visible]);

  useEffect(() => {
    if (!sidebarAberta) { setConfirmandoNovo(false); setCardNo(null); }
  }, [sidebarAberta]);

  // "Excluir projeto" (dentro do workspace): apaga o projeto atual de vez
  // e volta pra tela inicial (lista de projetos).
  const novoProjeto = () => {
    const antigo = projeto;
    const pacoteAntigo = nomePacote;
    setConfirmandoNovo(false);
    setSidebarAberta(false);
    setProjeto(null);
    setAbasAbertas([]);
    setArquivoAtivo(null);
    setPastasAbertas({});
    setPainelCompilacao(false);
    setLogCompilacao([]);
    setErrosCompilacao([]);
    setApkGerado(null);
    FileSystem.deleteAsync(caminhoEstadoProjeto(pacoteAntigo), { idempotent: true }).catch(() => {});
    if (antigo && antigo.pacote) {
      FileSystem.deleteAsync(pastaProjetoStudio(antigo.pacote), { idempotent: true }).catch(() => {});
      FileSystem.deleteAsync(pastaBinariosStudio(antigo.pacote), { idempotent: true }).catch(() => {});
    }
    removerDaListaProjetosStudio(pacoteAntigo)
      .then(setListaProjetos)
      .catch(() => {})
      .finally(() => setEtapa('home'));
  };

  // Tela inicial → "Criar projeto": zera os campos (pra não herdar dados
  // do último projeto aberto) e manda pra tela de configuração.
  const abrirTelaConfigNova = () => {
    setCardProjeto(null);
    setBuscaProjeto('');
    setNomeApp('Meu App');
    setNomePacote('com.dev.meuapp');
    setIconeEscolhido(ICONES_APP_STUDIO[0]);
    setCorIcone(CORES_ICONE_STUDIO[0]);
    setProjeto(null);
    setAbasAbertas([]);
    setArquivoAtivo(null);
    setPastasAbertas({});
    setEtapa('config');
  };

  // Tela inicial → toque num projeto da lista: lê o estado completo dele
  // (arquivos, abas, ícone...) e abre direto no workspace.
  const abrirProjetoDaLista = async (pacote) => {
    setBuscaProjeto('');
    setBuscaAberta(false);
    const e = await lerEstadoStudio(pacote);
    if (!e) {
      exibirAviso('Não foi possível abrir', 'Esse projeto parece corrompido ou foi removido.', 'erro');
      removerDaListaProjetosStudio(pacote).then(setListaProjetos).catch(() => {});
      return;
    }
    const existe = (c) => e.projeto.conteudos[c] !== undefined;
    setNomeApp(e.nomeApp || 'Meu App');
    setNomePacote(e.nomePacote || pacote);
    setIconeEscolhido(e.iconeEscolhido || ICONES_APP_STUDIO[0]);
    setCorIcone(e.corIcone || CORES_ICONE_STUDIO[0]);
    let proj = e.projeto;
    if (!proj.binarios) proj = { ...proj, binarios: {} };
    if (!arvoreTemCaminho(proj.arvore, ASSETS_STUDIO)) {
      proj = {
        ...proj,
        arvore: inserirNoNaArvore(proj.arvore, 'app/src/main', { nome: 'assets', caminho: ASSETS_STUDIO, tipo: 'pasta', filhos: [] }),
      };
    }
    setProjeto(proj);
    setPastasAbertas(e.pastasAbertas || {});
    setAbasAbertas(Array.isArray(e.abasAbertas) ? e.abasAbertas.filter(existe) : []);
    setArquivoAtivo(e.arquivoAtivo && existe(e.arquivoAtivo) ? e.arquivoAtivo : null);
    setPainelCompilacao(false);
    setApkGerado(null);
    setErrosCompilacao([]);
    setLogCompilacao([]);
    setEtapa('workspace');
  };

  // Tela inicial: toque na estrela do card — marca/desmarca favorito sem
  // precisar abrir o projeto. Persiste na hora.
  const alternarFavoritoProjeto = (pacote) => {
    setListaProjetos((atual) => {
      const nova = atual.map((p) => (p.pacote === pacote ? { ...p, favorito: !p.favorito } : p));
      gravarListaProjetosStudio(nova).catch(() => {});
      return nova;
    });
  };

  // Tela inicial: segurar o dedo num projeto abre o card com a opção de
  // excluir (sem precisar entrar no projeto pra apagar).
  const excluirProjetoDaLista = (pacote) => {
    setCardProjeto(null);
    FileSystem.deleteAsync(caminhoEstadoProjeto(pacote), { idempotent: true }).catch(() => {});
    FileSystem.deleteAsync(pastaProjetoStudio(pacote), { idempotent: true }).catch(() => {});
    FileSystem.deleteAsync(pastaBinariosStudio(pacote), { idempotent: true }).catch(() => {});
    removerDaListaProjetosStudio(pacote).then(setListaProjetos).catch(() => {});
  };

  // Workspace → seta de voltar: salva o projeto atual, atualiza a lista
  // (nome/ícone podem ter mudado desde a última vez) e volta pra home.
  const voltarParaHome = async () => {
    if (estadoRef.current) {
      await gravarEstadoStudio(estadoRef.current).catch(() => {});
      const lista = await atualizarListaProjetosStudio({
        pacote: nomePacote,
        nomeApp,
        iconeEscolhido,
        corIcone,
      }).catch(() => null);
      if (lista) setListaProjetos(lista);
    }
    setSidebarAberta(false);
    setPainelCompilacao(false);
    setProjeto(null);
    setAbasAbertas([]);
    setArquivoAtivo(null);
    setPastasAbertas({});
    setEtapa('home');
  };

  // Segurar o dedo numa pasta (ou num arquivo binário) abre o card de ação.
  const abrirCardArquivo = (no) => {
    if (no.tipo === 'pasta') { setCardNo(no); return; }
    if (projeto && projeto.binarios && projeto.binarios[no.caminho]) setCardNo(no);
  };

  // "Adicionar arquivo": abre o seletor do celular, copia o arquivo escolhido
  // pra dentro do projeto (na pasta segurada) e mostra ele no explorador.
  const adicionarArquivo = async (pastaCaminho) => {
    setCardNo(null);
    if (!projeto) return;
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets || !r.assets.length) return;
      const arq = r.assets[0];

      // nome seguro pro Android (sem espaço/acento) e sem sobrescrever outro
      const limpo = String(arq.name || 'arquivo').replace(/[^A-Za-z0-9._-]/g, '_');
      const ponto = limpo.lastIndexOf('.');
      const raiz = ponto > 0 ? limpo.slice(0, ponto) : limpo;
      const ext = ponto > 0 ? limpo.slice(ponto) : '';
      const existe = (c) => projeto.conteudos[c] !== undefined || !!(projeto.binarios && projeto.binarios[c]);
      let nome = limpo;
      let n = 2;
      while (existe(`${pastaCaminho}/${nome}`)) { nome = `${raiz}_${n}${ext}`; n += 1; }

      const caminho = `${pastaCaminho}/${nome}`;
      const destino = pastaBinariosStudio(projeto.pacote) + caminho;
      await FileSystem.makeDirectoryAsync(destino.split('/').slice(0, -1).join('/'), { intermediates: true });
      await FileSystem.copyAsync({ from: arq.uri, to: destino });
      FileSystem.deleteAsync(arq.uri, { idempotent: true }).catch(() => {}); // limpa o cache
      const info = await FileSystem.getInfoAsync(destino);

      setProjeto((atual) => ({
        ...atual,
        arvore: inserirNoNaArvore(atual.arvore, pastaCaminho, { nome, caminho, tipo: 'arquivo' }),
        binarios: { ...(atual.binarios || {}), [caminho]: { tamanho: info.size || 0 } },
      }));
      setPastasAbertas((atual) => ({ ...atual, [pastaCaminho]: true }));
      exibirAviso('Arquivo adicionado', `${nome} está em ${pastaCaminho}`, 'sucesso');
    } catch (e) {
      exibirAviso('Erro ao adicionar', String(e && e.message ? e.message : e), 'erro');
    }
  };

  const excluirBinario = (caminho) => {
    setCardNo(null);
    if (projeto) {
      FileSystem.deleteAsync(pastaBinariosStudio(projeto.pacote) + caminho, { idempotent: true }).catch(() => {});
    }
    setProjeto((atual) => {
      const bin = { ...(atual.binarios || {}) };
      delete bin[caminho];
      return { ...atual, arvore: removerNoDaArvore(atual.arvore, caminho), binarios: bin };
    });
  };

  const criarProjeto = () => {
    const app = nomeApp.trim() || 'Meu App';
    const pkg = nomePacote.trim() || 'com.dev.meuapp';
    const novo = montarProjetoNovo(app, pkg, corIcone);
    setProjeto(novo);
    setNomePacote(novo.pacote);
    // Já deixa o projeto gravado em disco desde o começo, e cadastrado na
    // lista de projetos (pra aparecer na tela inicial do CindraStudio).
    gravarProjetoStudio(novo).catch(() => {});
    atualizarListaProjetosStudio({
      pacote: novo.pacote,
      nomeApp: app,
      iconeEscolhido,
      corIcone,
    }).then(setListaProjetos).catch(() => {});
    // Abre as pastas do caminho até o MainActivity, e a raiz, já expandidas.
    const abertas = {};
    let acc = '';
    novo.arquivoInicial.split('/').slice(0, -1).forEach((parte) => {
      acc = acc ? `${acc}/${parte}` : parte;
      abertas[acc] = true;
    });
    setPastasAbertas(abertas);
    setAbasAbertas([novo.arquivoInicial]);
    setArquivoAtivo(novo.arquivoInicial);
    setEtapa('workspace');
  };

  const abrirArquivo = (caminho) => {
    if (projeto && projeto.binarios && projeto.binarios[caminho]) {
      const kb = Math.max(1, Math.round((projeto.binarios[caminho].tamanho || 0) / 1024));
      exibirAviso(caminho.split('/').pop(), `Arquivo binário (${kb} KB): não abre no editor de texto. Segure o dedo nele pra excluir.`, 'aviso');
      return;
    }
    setAbasAbertas((atual) => (atual.includes(caminho) ? atual : [...atual, caminho]));
    setArquivoAtivo(caminho);
    setSidebarAberta(false);
  };

  const fecharAba = (caminho) => {
    setAbasAbertas((atual) => {
      const restante = atual.filter((c) => c !== caminho);
      if (arquivoAtivo === caminho) {
        setArquivoAtivo(restante.length ? restante[restante.length - 1] : null);
      }
      return restante;
    });
  };

  const alterarConteudo = (texto) => {
    if (!arquivoAtivo) return;
    setProjeto((atual) => ({ ...atual, conteudos: { ...atual.conteudos, [arquivoAtivo]: texto } }));
  };

  const alternarPasta = (caminho) => {
    setPastasAbertas((atual) => ({ ...atual, [caminho]: !atual[caminho] }));
  };

  // Grava o projeto inteiro em disco (é de lá que o compilador nativo vai
  // ler). Devolve a pasta, ou null se der erro (já avisa o usuário).
  const salvarNoDisco = async () => {
    if (!projeto) return null;
    try {
      return await gravarProjetoStudio(projeto);
    } catch (e) {
      exibirAviso('Erro ao salvar', String(e && e.message ? e.message : e), 'erro');
      return null;
    }
  };

  // ▶ — grava, garante o android.jar e roda o pipeline nativo.
  const compilarProjeto = async () => {
    if (compilando) return;
    if (!ApkBuilder.disponivel) {
      exibirAviso('Precisa de rebuild', 'O módulo nativo apk-builder ainda não está neste app. Faça o eas build uma vez (veja o LEIAME do módulo).', 'aviso');
      return;
    }
    const pasta = await salvarNoDisco();
    if (!pasta) return;

    setCompilando(true);
    setApkGerado(null);
    setErrosCompilacao([]);
    setLogCompilacao([]);
    setPainelCompilacao(true);
    const add = (linha) => setLogCompilacao((atual) => atual.concat(linha).slice(-200));
    const assinatura = ApkBuilder.aoLogar(add);
    try {
      const amb = await ApkBuilder.ambiente();
      if (amb && amb.sdk < 26) throw new Error('O compilador precisa de Android 8 (API 26) ou mais novo.');
      if (amb && !amb.aapt2) throw new Error('aapt2 não encontrado no app (libaapt2.so). Veja o LEIAME do módulo.');

      let ultimoPct = -1;
      add('Preparando android.jar (só baixa na primeira vez)...');
      const jar = await garantirAndroidJarStudio((f) => {
        const pct = Math.floor(f * 10) * 10;
        if (pct !== ultimoPct) { ultimoPct = pct; add(`Baixando android.jar: ${pct}%`); }
      });

      const pastaSaida = `${FileSystem.documentDirectory}cindrastudio/_out/`;
      await FileSystem.makeDirectoryAsync(pastaSaida, { intermediates: true });
      const apkUri = `${pastaSaida}${projeto.pacote}.apk`;
      const r = await ApkBuilder.compilar(caminhoLocalStudio(pasta), jar, caminhoLocalStudio(apkUri));
      if (r.ok) {
        setApkGerado(caminhoLocalStudio(apkUri));
      } else {
        setErrosCompilacao(r.erros || []);
        add(`Falhou na etapa: ${r.etapa}`);
      }
    } catch (e) {
      add(`Erro: ${String(e && e.message ? e.message : e)}`);
    } finally {
      assinatura.remove();
      setCompilando(false);
    }
  };

  const instalarApk = async () => {
    if (!apkGerado) return;
    try {
      const r = await ApkBuilder.instalar(apkGerado);
      if (r === 'permissao') {
        exibirAviso('Libere a instalação', 'Ative "Permitir desta fonte" pro Cindra na tela que abriu e toque em Instalar de novo.', 'aviso');
      }
    } catch (e) {
      exibirAviso('Erro ao instalar', String(e && e.message ? e.message : e), 'erro');
    }
  };

  // Toque num erro: abre o arquivo dele no editor (se existir no projeto).
  const abrirErro = (erro) => {
    if (projeto && projeto.conteudos[erro.arquivo] !== undefined) {
      setPainelCompilacao(false);
      abrirArquivo(erro.arquivo);
    }
  };

  const conteudoAtivo = projeto && arquivoAtivo ? (projeto.conteudos[arquivoAtivo] || '') : '';
  const numeroDeLinhas = conteudoAtivo.split('\n').length;

  // ---------- Tela 0: lista de projetos (tela inicial) ----------
  const termoBusca = buscaProjeto.trim().toLowerCase();
  const listaFiltrada = termoBusca
    ? listaProjetos.filter(
        (p) => p.nomeApp.toLowerCase().includes(termoBusca) || p.pacote.toLowerCase().includes(termoBusca)
      )
    : listaProjetos;
  const totalFavoritos = listaProjetos.filter((p) => p.favorito).length;
  // Se o último favorito foi removido, o filtro "Favoritos" some — volta pra "todos".
  const filtroEfetivo = totalFavoritos > 0 ? filtroProjetos : 'todos';
  const listaExibida = (filtroEfetivo === 'favoritos'
    ? listaFiltrada.filter((p) => p.favorito)
    : [...listaFiltrada]
  ).sort((a, b) => {
    // Favoritos sempre no topo; depois, por data (mais recente primeiro) ou nome.
    if (!!a.favorito !== !!b.favorito) return a.favorito ? -1 : 1;
    if (ordenacao === 'nome') return a.nomeApp.localeCompare(b.nomeApp, 'pt-BR', { sensitivity: 'base' });
    return (b.atualizadoEm || 0) - (a.atualizadoEm || 0);
  });
  // "Continue de onde parou": o projeto mexido por último (entre todos, sem filtro).
  const ultimoProjeto = listaProjetos.reduce(
    (a, p) => (!a || (p.atualizadoEm || 0) > (a.atualizadoEm || 0) ? p : a),
    null
  );
  const fecharBusca = () => { setBuscaProjeto(''); setBuscaAberta(false); };
  const dispensarAvisoRecuperar = () => {
    setAvisoRecuperarVisivel(false);
    prefsRef.current = { ...prefsRef.current, avisoRecuperarDispensado: true };
    gravarPrefsStudio(prefsRef.current);
  };
  const abrirLinkApoio = () => {
    if (!STUDIO_LINK_APOIO) {
      exibirAviso('Em breve', 'Esse link ainda não foi configurado.', 'aviso');
      return;
    }
    Linking.openURL(STUDIO_LINK_APOIO).catch(() => exibirAviso('Não foi possível abrir', 'Tente de novo mais tarde.', 'erro'));
  };

  const renderCardProjeto = (p) => (
    <TouchableOpacity
      key={p.pacote}
      style={studioStyles.projCard}
      onPress={() => abrirProjetoDaLista(p.pacote)}
      onLongPress={() => setCardProjeto(p)}
      delayLongPress={350}
      activeOpacity={0.8}
    >
      <View style={[studioStyles.projIcon, { backgroundColor: p.corIcone || CORES_ICONE_STUDIO[0] }]}>
        <MaterialCommunityIcons
          name={p.iconeEscolhido || ICONES_APP_STUDIO[0]}
          size={28}
          color="#1a0806"
        />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={studioStyles.projNome} numberOfLines={1}>{p.nomeApp}</Text>
          {p.favorito && <MaterialCommunityIcons name="star" size={14} color={COLORS.gold} />}
        </View>
        <Text style={studioStyles.projPacote} numberOfLines={1}>
          {p.pacote}{p.atualizadoEm ? `  ·  ${tempoRelativoStudio(p.atualizadoEm)}` : ''}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => setCardProjeto(p)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={studioStyles.projMais}
      >
        <MaterialCommunityIcons name="dots-horizontal" size={22} color={COLORS.dim} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderChip = (id, rotulo, total) => {
    const ativo = filtroEfetivo === id;
    return (
      <TouchableOpacity
        key={id}
        style={[studioStyles.chip, ativo && studioStyles.chipAtivo]}
        onPress={() => setFiltroProjetos(id)}
        activeOpacity={0.8}
      >
        <Text style={[studioStyles.chipTexto, ativo && studioStyles.chipTextoAtivo]}>{rotulo}</Text>
        <View style={[studioStyles.chipContador, ativo && studioStyles.chipContadorAtivo]}>
          <Text style={[studioStyles.chipContadorTexto, ativo && studioStyles.chipContadorTextoAtivo]}>{total}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAbaProjetos = () => (
    <>
      {/* Topo: título + lupa. Tocar na lupa troca o cabeçalho por uma barra de busca. */}
      <View style={studioStyles.homeHeader}>
        {buscaAberta ? (
          <View style={studioStyles.homeBuscaPilula}>
            <MaterialCommunityIcons name="magnify" size={20} color={COLORS.dim} />
            <TextInput
              style={studioStyles.buscaInput}
              value={buscaProjeto}
              onChangeText={setBuscaProjeto}
              placeholder="Buscar projeto..."
              placeholderTextColor={COLORS.dim}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <TouchableOpacity onPress={fecharBusca} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close" size={20} color={COLORS.ink} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: 12 }}>
              <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.ink} />
            </TouchableOpacity>
            <Text style={studioStyles.homeTitulo} numberOfLines={1}>Seus projetos</Text>
            <TouchableOpacity
              style={studioStyles.homeIconBtn}
              onPress={() => exibirAviso('Em breve', 'A caixa de entrada ainda não está disponível.', 'aviso')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="inbox-outline" size={22} color={COLORS.ink} />
            </TouchableOpacity>
            {listaProjetos.length > 0 && (
              <TouchableOpacity
                style={[studioStyles.homeIconBtn, { marginLeft: 8 }]}
                onPress={() => setBuscaAberta(true)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="magnify" size={22} color={COLORS.ink} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* Botão grande "Novo projeto" + botão ⋮ (ordenar) */}
      <View style={studioStyles.homeAcoes}>
        <TouchableOpacity style={studioStyles.homeBtnNovo} onPress={abrirTelaConfigNova} activeOpacity={0.85}>
          <MaterialCommunityIcons name="plus" size={26} color="#1a0806" />
          <Text style={studioStyles.homeBtnNovoText}>Novo projeto</Text>
        </TouchableOpacity>
        {listaProjetos.length > 0 && (
          <TouchableOpacity style={studioStyles.homeBtnMais} onPress={() => setMenuMaisAberto(true)} activeOpacity={0.8}>
            <MaterialCommunityIcons name="dots-vertical" size={24} color={COLORS.ink} />
          </TouchableOpacity>
        )}
      </View>

      {listaProjetos.length === 0 ? (
        <View style={studioStyles.homeVazio}>
          <View style={studioStyles.homeVazioIcone}>
            <MaterialCommunityIcons name="folder-star-outline" size={38} color={COLORS.ember} />
          </View>
          <Text style={studioStyles.homeVazioTitulo}>Nenhum projeto ainda</Text>
          <Text style={studioStyles.homeVazioTexto}>
            Toque em "Novo projeto" pra começar o primeiro.
          </Text>
        </View>
      ) : (
        <>
          <View style={studioStyles.homeChips}>
            {renderChip('todos', 'Projetos', listaProjetos.length)}
            {totalFavoritos > 0 && renderChip('favoritos', 'Favoritos', totalFavoritos)}
          </View>

          {listaExibida.length === 0 ? (
            <View style={studioStyles.homeVazio}>
              <MaterialCommunityIcons name="magnify-close" size={36} color={COLORS.dim} />
              <Text style={[studioStyles.homeVazioTexto, { marginTop: 12 }]}>
                Nenhum projeto encontrado para "{buscaProjeto.trim()}".
              </Text>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 }}
            >
              {avisoRecuperarVisivel && !termoBusca && filtroEfetivo === 'todos' && (
                <View style={studioStyles.avisoCard}>
                  <MaterialCommunityIcons name="information-outline" size={24} color={COLORS.ink} />
                  <Text style={studioStyles.avisoTexto}>Projetos de uma versão antiga podem ser recuperados.</Text>
                  <TouchableOpacity style={studioStyles.avisoBtn} onPress={dispensarAvisoRecuperar} activeOpacity={0.85}>
                    <Text style={studioStyles.avisoBtnText}>Dispensar</Text>
                  </TouchableOpacity>
                </View>
              )}

              {listaExibida.map(renderCardProjeto)}

              {!termoBusca && filtroEfetivo === 'todos' && (
                <TouchableOpacity style={studioStyles.anuncioCard} onPress={abrirLinkApoio} activeOpacity={0.85}>
                  <View style={studioStyles.anuncioTag}>
                    <Text style={studioStyles.anuncioTagTexto}>Anúncio</Text>
                  </View>
                  <View style={studioStyles.anuncioLinha}>
                    <View style={studioStyles.anuncioIcone}>
                      <MaterialCommunityIcons name="heart" size={26} color={COLORS.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={studioStyles.anuncioTitulo} numberOfLines={1}>Gostando do CindraStudio?</Text>
                      <Text style={studioStyles.anuncioSub} numberOfLines={2}>Apoie o projeto e ajude a Cindra a crescer.</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.dim} />
                  </View>
                </TouchableOpacity>
              )}

              {ultimoProjeto && !termoBusca && filtroEfetivo === 'todos' && (
                <View style={studioStyles.continuarCard}>
                  <View style={studioStyles.continuarTopo}>
                    <MaterialCommunityIcons name="lightning-bolt-outline" size={20} color="#ffdcd2" />
                    <Text style={studioStyles.continuarTitulo}>Continue de onde parou</Text>
                  </View>
                  <Text style={studioStyles.continuarSub} numberOfLines={2}>
                    {[
                      ultimoProjeto.nomeApp,
                      'Android',
                      ultimoProjeto.atualizadoEm ? `Editado ${tempoRelativoStudio(ultimoProjeto.atualizadoEm)}` : '',
                    ].filter(Boolean).join(' · ')}
                  </Text>
                  <TouchableOpacity
                    style={studioStyles.continuarBtn}
                    onPress={() => abrirProjetoDaLista(ultimoProjeto.pacote)}
                    activeOpacity={0.85}
                  >
                    <Text style={studioStyles.continuarBtnText} numberOfLines={1}>Abrir {ultimoProjeto.nomeApp}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </>
      )}

    </>
  );

  // Abas ainda sem conteúdo (Explorar / Aprender / Daily).
  const renderAbaEmBreve = () => {
    const aba = ABAS_HOME_STUDIO.find((a) => a.id === abaHome) || ABAS_HOME_STUDIO[0];
    return (
      <>
        <View style={studioStyles.homeHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginRight: 12 }}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.ink} />
          </TouchableOpacity>
          <Text style={studioStyles.homeTitulo} numberOfLines={1}>{aba.rotulo}</Text>
        </View>
        <View style={studioStyles.homeVazio}>
          <View style={studioStyles.homeVazioIcone}>
            <MaterialCommunityIcons name={aba.iconeAtivo} size={38} color={COLORS.ember} />
          </View>
          <Text style={studioStyles.homeVazioTitulo}>Em breve</Text>
          <Text style={studioStyles.homeVazioTexto}>A aba "{aba.rotulo}" ainda está em construção.</Text>
        </View>
      </>
    );
  };

  // Barra de navegação de baixo (Projetos / Explorar / Aprender / Daily).
  const renderNavHome = () => (
    <View style={[studioStyles.navHome, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
      {ABAS_HOME_STUDIO.map((a) => {
        const ativo = abaHome === a.id;
        return (
          <TouchableOpacity key={a.id} style={studioStyles.navItem} onPress={() => setAbaHome(a.id)} activeOpacity={0.8}>
            <View style={[studioStyles.navPilula, ativo && studioStyles.navPilulaAtiva]}>
              <MaterialCommunityIcons
                name={ativo ? a.iconeAtivo : a.icone}
                size={24}
                color={ativo ? '#ff8a68' : COLORS.dim}
              />
            </View>
            <Text style={[studioStyles.navRotulo, ativo && studioStyles.navRotuloAtivo]}>{a.rotulo}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderHome = () => (
    <>
      <View pointerEvents="none" style={studioStyles.homeGlowTop} />
      <View pointerEvents="none" style={studioStyles.homeGlowBottom} />

      {abaHome === 'projetos' ? renderAbaProjetos() : renderAbaEmBreve()}

      {renderNavHome()}

      {menuMaisAberto && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={studioStyles.sidebarBackdrop} onPress={() => setMenuMaisAberto(false)} />
          <View style={studioStyles.cardAcao}>
            <Text style={studioStyles.cardAcaoTitulo}>Ordenar por</Text>
            <Text style={studioStyles.cardAcaoCaminho}>Os favoritos sempre ficam no topo.</Text>
            {[
              ['recentes', 'Mais recentes', 'clock-outline'],
              ['nome', 'Nome (A–Z)', 'sort-alphabetical-ascending'],
            ].map(([id, rotulo, icone], i) => {
              const ativo = ordenacao === id;
              return (
                <TouchableOpacity
                  key={id}
                  style={[studioStyles.cardAcaoBtn, i > 0 && { marginTop: 8 }]}
                  onPress={() => { setOrdenacao(id); setMenuMaisAberto(false); }}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons name={icone} size={18} color={ativo ? COLORS.ember : COLORS.dim} />
                  <Text style={[studioStyles.cardAcaoBtnText, ativo && { color: COLORS.ember }]}>{rotulo}</Text>
                  {ativo && <MaterialCommunityIcons name="check" size={18} color={COLORS.ember} style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {cardProjeto && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={studioStyles.sidebarBackdrop} onPress={() => setCardProjeto(null)} />
          <View style={studioStyles.cardAcao}>
            <Text style={studioStyles.cardAcaoTitulo} numberOfLines={1}>{cardProjeto.nomeApp}</Text>
            <Text style={studioStyles.cardAcaoCaminho} numberOfLines={1}>{cardProjeto.pacote}</Text>
            <TouchableOpacity
              style={studioStyles.cardAcaoBtn}
              onPress={() => { alternarFavoritoProjeto(cardProjeto.pacote); setCardProjeto(null); }}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={cardProjeto.favorito ? 'star-off-outline' : 'star-outline'}
                size={18}
                color={COLORS.gold}
              />
              <Text style={[studioStyles.cardAcaoBtnText, { color: COLORS.gold }]}>
                {cardProjeto.favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[studioStyles.cardAcaoBtn, { marginTop: 8 }]}
              onPress={() => excluirProjetoDaLista(cardProjeto.pacote)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="delete-outline" size={18} color="#ff8a80" />
              <Text style={[studioStyles.cardAcaoBtnText, { color: '#ff8a80' }]}>Excluir projeto</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );

  // ---------- Tela 1: configuração do projeto ----------
  const renderConfig = () => (
    <>
      <View style={[styles.chatHeader, { paddingTop: 10 }]}>
        <TouchableOpacity onPress={() => setEtapa('home')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.ink} />
        </TouchableOpacity>
        <Text style={styles.chatHeaderTitle}>CindraStudio</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom, 20) + 20 }} keyboardShouldPersistTaps="handled">
        <View style={studioStyles.previewCard}>
          <View style={[studioStyles.previewIcon, { backgroundColor: hexParaRgba(corIcone, 0.18) }]}>
            <MaterialCommunityIcons name={iconeEscolhido} size={40} color={corIcone} />
          </View>
          <Text style={studioStyles.previewName}>{nomeApp.trim() || 'Meu App'}</Text>
          <Text style={studioStyles.previewPkg}>{nomePacote.trim() || 'com.dev.meuapp'}</Text>
        </View>

        <Text style={studioStyles.cfgLabel}>Nome do app</Text>
        <TextInput
          style={studioStyles.cfgInput}
          value={nomeApp}
          onChangeText={setNomeApp}
          placeholder="Ex: Abismo de Lumen"
          placeholderTextColor={COLORS.dim}
        />

        <Text style={studioStyles.cfgLabel}>Nome do pacote</Text>
        <TextInput
          style={studioStyles.cfgInput}
          value={nomePacote}
          onChangeText={setNomePacote}
          placeholder="com.seunome.appname"
          placeholderTextColor={COLORS.dim}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={studioStyles.cfgHint}>Identificador único do app (convenção: com.seunome.nomedoapp). Evite espaços e acentos.</Text>

        <Text style={studioStyles.cfgLabel}>Ícone do app</Text>
        <View style={studioStyles.iconGrid}>
          {ICONES_APP_STUDIO.map((nome) => (
            <TouchableOpacity
              key={nome}
              style={[
                studioStyles.iconOption,
                { backgroundColor: hexParaRgba(corIcone, 0.15) },
                iconeEscolhido === nome && studioStyles.iconOptionAtiva,
              ]}
              onPress={() => setIconeEscolhido(nome)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name={nome} size={24} color={corIcone} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={studioStyles.colorRow}>
          {CORES_ICONE_STUDIO.map((cor) => (
            <TouchableOpacity
              key={cor}
              style={[studioStyles.colorDot, { backgroundColor: cor }, corIcone === cor && studioStyles.colorDotAtiva]}
              onPress={() => setCorIcone(cor)}
              activeOpacity={0.75}
            />
          ))}
        </View>

        <TouchableOpacity style={studioStyles.criarBtn} onPress={criarProjeto} activeOpacity={0.85}>
          <Text style={studioStyles.criarBtnText}>Criar projeto</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );

  // ---------- Tela 2: workspace (explorador + editor) ----------
  const renderWorkspace = () => (
    <>
      <View style={studioStyles.topBar}>
        <TouchableOpacity style={studioStyles.topBarIconBtn} onPress={voltarParaHome} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="arrow-left" size={20} color={COLORS.ink} />
        </TouchableOpacity>
        <TouchableOpacity style={studioStyles.topBarIconBtn} onPress={() => setSidebarAberta(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="file-tree-outline" size={20} color={COLORS.ink} />
        </TouchableOpacity>
        <Text style={studioStyles.topBarTitle} numberOfLines={1}>{nomeApp || 'Meu App'}</Text>
        <TouchableOpacity
          style={studioStyles.topBarIconBtn}
          onPress={() => exibirAviso('Em breve', 'Undo/redo ainda não estão disponíveis.', 'aviso')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="undo" size={19} color={COLORS.dim} />
        </TouchableOpacity>
        <TouchableOpacity
          style={studioStyles.topBarIconBtn}
          onPress={async () => {
            const pasta = await salvarNoDisco();
            if (pasta) exibirAviso('Salvo', 'Projeto gravado no armazenamento do app.', 'sucesso');
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="content-save-outline" size={19} color={COLORS.dim} />
        </TouchableOpacity>
        <TouchableOpacity
          style={studioStyles.topBarIconBtn}
          onPress={compilarProjeto}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {compilando
            ? <ActivityIndicator size="small" color="#8bd450" />
            : <MaterialCommunityIcons name="play-circle" size={24} color="#8bd450" />}
        </TouchableOpacity>
        <TouchableOpacity style={studioStyles.topBarIconBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialCommunityIcons name="close" size={20} color={COLORS.dim} />
        </TouchableOpacity>
      </View>

      {abasAbertas.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={studioStyles.tabsBar}>
          {abasAbertas.map((caminho) => {
            const ativa = caminho === arquivoAtivo;
            const nomeArquivo = caminho.split('/').pop();
            const { icon, color } = iconeArquivoStudio(nomeArquivo);
            return (
              <TouchableOpacity
                key={caminho}
                style={[studioStyles.tab, ativa && studioStyles.tabAtiva]}
                onPress={() => setArquivoAtivo(caminho)}
                activeOpacity={0.75}
              >
                <MaterialCommunityIcons name={icon} size={14} color={ativa ? color : COLORS.dim} style={{ marginRight: 6 }} />
                <Text style={[studioStyles.tabText, ativa && studioStyles.tabTextAtiva]} numberOfLines={1}>{nomeArquivo}</Text>
                <TouchableOpacity onPress={() => fecharAba(caminho)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
                  <MaterialCommunityIcons name="close" size={13} color={COLORS.dim} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {arquivoAtivo && (
        <View style={studioStyles.breadcrumb}>
          <Text style={studioStyles.breadcrumbText} numberOfLines={1}>{arquivoAtivo.split('/').join(' \u203a ')}</Text>
        </View>
      )}

      {arquivoAtivo ? (
        <ScrollView style={{ flex: 1, backgroundColor: '#0a0a0c' }}>
          <View style={studioStyles.editorRow}>
            <View style={studioStyles.lineNumbers}>
              {Array.from({ length: numeroDeLinhas }).map((_, i) => (
                <Text key={i} style={studioStyles.lineNumberText}>{i + 1}</Text>
              ))}
            </View>
            <TextInput
              style={studioStyles.codeInput}
              value={conteudoAtivo}
              onChangeText={alterarConteudo}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              scrollEnabled={false}
            />
          </View>
        </ScrollView>
      ) : (
        <View style={studioStyles.emptyEditor}>
          <MaterialCommunityIcons name="file-tree-outline" size={40} color={COLORS.dim} />
          <Text style={{ color: COLORS.dim, fontSize: 13.5, marginTop: 12, textAlign: 'center' }}>
            Nenhum arquivo aberto. Toque no ícone de pastas, no canto superior esquerdo, pra ver os arquivos do projeto.
          </Text>
        </View>
      )}

      {sidebarAberta && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={studioStyles.sidebarBackdrop} onPress={() => setSidebarAberta(false)} />
          <View style={[studioStyles.sidebarPanel, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={studioStyles.sidebarHeader}>
              <Text style={studioStyles.sidebarTitle}>Arquivos do lrojeto</Text>
              <TouchableOpacity onPress={() => setSidebarAberta(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={18} color={COLORS.dim} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }}>
              {projeto && projeto.arvore.map((no) => (
                <NoArvoreArquivo
                  key={no.caminho}
                  no={no}
                  profundidade={0}
                  pastasAbertas={pastasAbertas}
                  alternarPasta={alternarPasta}
                  arquivoAtivo={arquivoAtivo}
                  onAbrirArquivo={abrirArquivo}
                  aoSegurar={abrirCardArquivo}
                />
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[studioStyles.novoProjBtn, confirmandoNovo && { borderColor: 'rgba(255,90,78,0.5)' }]}
              onPress={() => (confirmandoNovo ? novoProjeto() : setConfirmandoNovo(true))}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={confirmandoNovo ? 'alert-outline' : 'trash-can-outline'}
                size={16}
                color={confirmandoNovo ? '#ff8a80' : COLORS.dim}
              />
              <Text style={[studioStyles.novoProjText, confirmandoNovo && { color: '#ff8a80' }]}>
                {confirmandoNovo ? 'Toque de novo: apaga este projeto' : 'Excluir projeto'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {cardNo && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={studioStyles.sidebarBackdrop} onPress={() => setCardNo(null)} />
          <View style={studioStyles.cardAcao}>
            <Text style={studioStyles.cardAcaoTitulo} numberOfLines={1}>{cardNo.nome}</Text>
            <Text style={studioStyles.cardAcaoCaminho} numberOfLines={2}>{cardNo.caminho}</Text>
            {cardNo.tipo === 'pasta' ? (
              <TouchableOpacity style={studioStyles.cardAcaoBtn} onPress={() => adicionarArquivo(cardNo.caminho)} activeOpacity={0.8}>
                <MaterialCommunityIcons name="file-plus-outline" size={18} color={COLORS.ember} />
                <Text style={studioStyles.cardAcaoBtnText}>Adicionar arquivo</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={studioStyles.cardAcaoBtn} onPress={() => excluirBinario(cardNo.caminho)} activeOpacity={0.8}>
                <MaterialCommunityIcons name="delete-outline" size={18} color="#ff8a80" />
                <Text style={[studioStyles.cardAcaoBtnText, { color: '#ff8a80' }]}>Excluir arquivo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {painelCompilacao && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={studioStyles.sidebarBackdrop} onPress={() => !compilando && setPainelCompilacao(false)} />
          <View style={[studioStyles.compilePanel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={studioStyles.sidebarHeader}>
              <Text style={studioStyles.sidebarTitle}>
                {compilando ? 'Compilando...' : apkGerado ? 'APK pronto' : errosCompilacao.length ? 'Erros na compilação' : 'Compilação'}
              </Text>
              <TouchableOpacity onPress={() => setPainelCompilacao(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialCommunityIcons name="close" size={18} color={COLORS.dim} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 10 }}>
              {errosCompilacao.map((erro, i) => (
                <TouchableOpacity key={`e${i}`} style={studioStyles.erroCard} activeOpacity={0.75} onPress={() => abrirErro(erro)}>
                  <Text style={studioStyles.erroArquivo} numberOfLines={2}>
                    {erro.arquivo}{erro.linha ? `  ·  linha ${erro.linha}` : ''}
                  </Text>
                  <Text style={studioStyles.erroMensagem}>{erro.mensagem}</Text>
                </TouchableOpacity>
              ))}
              {logCompilacao.map((linha, i) => (
                <Text key={`l${i}`} style={studioStyles.logLinha}>{linha}</Text>
              ))}
            </ScrollView>
            {apkGerado && !compilando && (
              <TouchableOpacity style={studioStyles.instalarBtn} onPress={instalarApk} activeOpacity={0.85}>
                <MaterialCommunityIcons name="cellphone-arrow-down" size={18} color="#1a0806" />
                <Text style={studioStyles.instalarBtnText}>Instalar APK</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: etapa === 'workspace' ? '#000000' : COLORS.sheet, paddingTop: insets.top }}>
      {etapa === 'home' ? renderHome() : etapa === 'config' ? renderConfig() : renderWorkspace()}
    </View>
  );
}

export { NoticeCardHost };
export default CindraStudioScreen;
