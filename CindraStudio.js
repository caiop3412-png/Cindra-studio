import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity as TouchableOpacityBase,
  Platform,
  ScrollView,
  Pressable,
  Animated,
  Easing,
  ActivityIndicator,
  AppState,
  Alert,
  Linking,
  Switch,
  Modal,
  PixelRatio,
  Keyboard,
  Image,
  Share,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
// SDK 54: StorageAccessFramework, documentDirectory, writeAsStringAsync etc
// só existem no caminho "legacy".
import * as FileSystem from 'expo-file-system/legacy';
// Módulo nativo local (modules/apk-builder): aapt2 + ECJ + D8 + apksig.
import * as ApkBuilder from './modules/apk-builder';
// Editor de imagem (cortar, zoom, girar, espelhar) usado na foto do ícone.
import EditorImagem from './EditorImagem';

// Foto do ícone do app (galeria → recorte quadrado → PNG 512×512). Precisa
// de: npx expo install expo-image-picker expo-image-manipulator (e um build
// novo). Carregados de forma opcional: se algum faltar, o resto do Studio
// continua funcionando normal e só o botão de foto avisa o que instalar.
let ImagePicker = null;
let ImageManipulator = null;
try { ImagePicker = require('expo-image-picker'); } catch (e) { ImagePicker = null; }
try { ImageManipulator = require('expo-image-manipulator'); } catch (e) { ImageManipulator = null; }
// Botão "Copiar" da aba Aprender: opcional também. Sem o expo-clipboard,
// cai pro menu de compartilhar do Android.
let Clipboard = null;
try { Clipboard = require('expo-clipboard'); } catch (e) { Clipboard = null; }
// Compartilhar o APK (WhatsApp, Drive, Bluetooth...): opcional também. Sem o
// expo-sharing o botão só avisa o que instalar.
let Sharing = null;
try { Sharing = require('expo-sharing'); } catch (e) { Sharing = null; }
// Navegador por cima do app (Chrome Custom Tabs) pros links da aba Publicar.
// Precisa de: npx expo install expo-web-browser (e um build novo). Sem ele,
// o link abre no navegador normal do aparelho.
let WebBrowser = null;
try { WebBrowser = require('expo-web-browser'); } catch (e) { WebBrowser = null; }

// Notificação de "tem atualização": opcional (precisa do expo-notifications).
// Sem ele o bloqueio de atualização funciona do mesmo jeito, só não notifica.
let Notifications = null;
try { Notifications = require('expo-notifications'); } catch (e) { Notifications = null; }

// Atualização OTA (a que você já usa pra atualizar sem gerar APK novo).
let Updates = null;
try { Updates = require('expo-updates'); } catch (e) { Updates = null; }

// Versão nativa do APK instalado (versionCode). Se o módulo não existir (APK antigo), vira 0.
let ExpoApplication = null;
try { ExpoApplication = require('expo-application'); } catch (e) { ExpoApplication = null; }
function versaoCodigoDoApk() {
  try {
    const n = parseInt(ExpoApplication && ExpoApplication.nativeBuildVersion, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (e) { return 0; }
}

const SUGESTOES_AUTO_DESLIGADAS = [];
const CODIGO_FONTE = 13; // fonte do editor (também usada pra calcular a largura do código)

// Altura de linha do editor em número INTEIRO de pixels reais. O Android
// arredonda a altura de linha do TextInput pra cima em pixels; as linhas
// coloridas, os números e os realces são posicionados por fora em dp
// (linha × altura). Com 20dp numa tela de densidade 2.625 (=52,5px) o
// TextInput usava 53px por linha e o resto 52,5px — a diferença de 0,5px
// por linha acumula e lá pelas linhas 40+ o cursor já estava uma linha
// abaixo da letra colorida ("escrevo embaixo e sai em cima"). Aqui todo
// mundo passa a usar o mesmo valor, que fecha em pixel inteiro.
function linhaSemDrift(dp) {
  const r = PixelRatio.get() || 1;
  return (Math.max(1, Math.round(dp * r)) - 0.001) / r;
}

const COLORS = {
  ink: '#ffffff',
  dim: 'rgba(255,255,255,0.6)',
  line: 'rgba(255,255,255,0.14)',
  lineSoft: 'rgba(255,255,255,0.07)',
  panel: 'rgba(24,16,52,0.6)',
  panel2: '#1a1236',
  sheet: '#000000',
  ember: '#b43cff',
  emberDeep: '#4f46ff',
  emberGlow: 'rgba(180,60,255,0.55)',
  // Núcleo quente do brasido — usado com moderação, só em detalhes de
  // assinatura (contorno do avatar, cursor, badge de destaque), pra dar
  // a sensação de "brasa" (vermelho -> laranja -> dourado) em vez de um
  // laranja chapado só.
  gold: '#ff7ad9',
  goldGlow: 'rgba(255,122,217,0.35)',
  pink: '#ff2fc6',
  pinkGlow: 'rgba(255,47,198,0.5)',
  error: '#ff6b6b',
  // Mantidos por compatibilidade com estilos que ainda referenciam
  // "blue" — agora apontam pro tom ember pra tudo ficar consistente.
  blue: '#b43cff',
  blueGlow: 'rgba(180,60,255,0.55)',
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
  // Cores do destaque de sintaxe do editor (Studio) — paleta própria pra
  // não colidir com os selos/badges que já usam ember/roxo/azul acima.
  syntaxKeyword: '#ff7ad9',
  syntaxString: '#ffd479',
  syntaxComment: 'rgba(255,255,255,0.32)',
  syntaxNumber: '#8fd6ff',
  syntaxTag: '#8fd6ff',
  syntaxAttr: '#c9a7ff',
};

// Botão com animação: afunda quando o dedo encosta e, ao clicar, SOBE e DESCE
// (pulinho com molinha). Todos os <TouchableOpacity> do arquivo usam este
// componente (mesma API do original).
const TouchableAnimado = Animated.createAnimatedComponent(TouchableOpacityBase);
function TouchableOpacity({ style, onPress, onPressIn, onPressOut, ...resto }) {
  const escala = useRef(new Animated.Value(1)).current;
  const subida = useRef(new Animated.Value(0)).current;
  const estiloAnim = useMemo(
    () => [style, { transform: [{ translateY: subida }, { scale: escala }] }],
    [style]
  );
  const apertar = (e) => {
    Animated.timing(escala, { toValue: 0.95, duration: 110, useNativeDriver: true }).start();
    if (onPressIn) onPressIn(e);
  };
  const soltar = (e) => {
    Animated.spring(escala, { toValue: 1, stiffness: 160, damping: 11, mass: 1, useNativeDriver: true }).start();
    if (onPressOut) onPressOut(e);
  };
  const clicar = (e) => {
    subida.stopAnimation();
    Animated.sequence([
      Animated.timing(subida, { toValue: -6, duration: 140, useNativeDriver: true }),
      Animated.spring(subida, { toValue: 0, stiffness: 130, damping: 10, mass: 1, useNativeDriver: true }),
    ]).start();
    if (onPress) onPress(e);
  };
  return (
    <TouchableAnimado
      {...resto}
      style={estiloAnim}
      onPress={clicar}
      onPressIn={apertar}
      onPressOut={soltar}
    />
  );
}

// Cores misturadas do logo da Cindra (azul -> roxo -> rosa).
const GRAD_LOGO = ['#3b4bff', '#8b3dff', '#ff2fc6'];
const GRAD_LOGO_ESCURO = ['#2b2fb8', '#6a2fd0', '#b02fb5'];
// Degradê feito só com Views (sem pacote nativo, sem precisar gerar outro APK):
// várias faixas finas lado a lado, cada uma com a cor interpolada.
function hexParaRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function corNoDegrade(cores, t) {
  const pos = t * (cores.length - 1);
  const i = Math.min(cores.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexParaRgb(cores[i]);
  const b = hexParaRgb(cores[i + 1]);
  return 'rgb(' + a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',') + ')';
}
const FAIXAS_DEGRADE = 72;
function Grad({ cores = GRAD_LOGO }) {
  const faixas = useMemo(
    () => Array.from({ length: FAIXAS_DEGRADE }, (_, k) => corNoDegrade(cores, (k + 0.5) / FAIXAS_DEGRADE)),
    [cores]
  );
  // Cada faixa vai do seu ponto até a borda direita e a próxima fica por cima.
  // Assim não existe emenda entre as faixas (antes aparecia uma linha fininha
  // entre elas, principalmente ao tocar no botão).
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {faixas.map((c, k) => (
        <View
          key={k}
          style={{ position: 'absolute', top: 0, bottom: 0, right: 0, left: `${(k / FAIXAS_DEGRADE) * 100}%`, backgroundColor: c }}
        />
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Fundo vivo (home/config): 1) aurora azul/rosa que respira devagar e
// 2) estrelinhas coloridas piscando. Tudo em View + Animated (sem pacote
// nativo), com driver nativo pra não pesar.
// ─────────────────────────────────────────────────────────
function BrilhoSuave({ cor, tam }) {
  // sem blur no RN: empilha círculos concêntricos bem transparentes
  const camadas = 9;
  return (
    <View style={{ width: tam, height: tam, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: camadas }, (_, k) => {
        const d = tam * (1 - k / camadas);
        return (
          <View
            key={k}
            style={{
              position: 'absolute',
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: cor,
              opacity: 0.045,
            }}
          />
        );
      })}
    </View>
  );
}

const CORES_ESTRELA = ['#6f7bff', '#c06bff', '#ff6bd6', '#ffffff'];

function FundoVivo() {
  const { width, height } = useWindowDimensions();
  const estrelas = useMemo(() => {
    let semente = 7;
    const rnd = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
    return Array.from({ length: 28 }, () => ({
      x: rnd(), y: rnd(), r: 1 + rnd() * 1.6,
      cor: CORES_ESTRELA[Math.floor(rnd() * CORES_ESTRELA.length)],
      atraso: Math.round(rnd() * 2600), dur: Math.round(1300 + rnd() * 2200),
    }));
  }, []);
  const brilhos = useRef(estrelas.map(() => new Animated.Value(0.12))).current;
  const aurora = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loops = brilhos.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(estrelas[i].atraso),
      Animated.timing(v, { toValue: 1, duration: estrelas[i].dur, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.12, duration: estrelas[i].dur, useNativeDriver: true }),
    ])));
    loops.forEach((l) => l.start());
    const lenta = Animated.loop(Animated.sequence([
      Animated.timing(aurora, { toValue: 1, duration: 7000, useNativeDriver: true }),
      Animated.timing(aurora, { toValue: 0, duration: 7000, useNativeDriver: true }),
    ]));
    lenta.start();
    return () => { loops.forEach((l) => l.stop()); lenta.stop(); };
  }, []);

  const tamAzul = Math.max(width, 320) * 1.15;
  const tamRosa = Math.max(width, 320) * 1.0;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        renderToHardwareTextureAndroid
        style={{
          position: 'absolute',
          top: -tamAzul * 0.45,
          left: -tamAzul * 0.35,
          opacity: aurora.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
          transform: [
            { translateX: aurora.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
            { scale: aurora.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
          ],
        }}
      >
        <BrilhoSuave cor="#3b4bff" tam={tamAzul} />
      </Animated.View>
      <Animated.View
        renderToHardwareTextureAndroid
        style={{
          position: 'absolute',
          bottom: -tamRosa * 0.4,
          right: -tamRosa * 0.35,
          opacity: aurora.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }),
          transform: [
            { translateX: aurora.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) },
            { scale: aurora.interpolate({ inputRange: [0, 1], outputRange: [1.15, 1] }) },
          ],
        }}
      >
        <BrilhoSuave cor="#ff2fc6" tam={tamRosa} />
      </Animated.View>
      {estrelas.map((e, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: e.x * width,
            top: e.y * height,
            width: e.r * 5,
            height: e.r * 5,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: brilhos[i],
          }}
        >
          <View style={{ position: 'absolute', width: e.r * 5, height: e.r * 5, borderRadius: e.r * 2.5, backgroundColor: e.cor, opacity: 0.18 }} />
          <View style={{ width: e.r * 2, height: e.r * 2, borderRadius: e.r, backgroundColor: e.cor }} />
        </Animated.View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// Entrada aleatória de tela: cada vez que uma tela aparece, sorteia um jeito
// de chegar (vindo de baixo, de cima, da esquerda, da direita, balançando
// girando ou com zoom) e se estabiliza com uma molinha (passa um pouco do
// ponto, balança e assenta).
// ─────────────────────────────────────────────────────────
function EntradaAleatoria({ children, animar = true, style }) {
  const { width, height } = useWindowDimensions();
  const [tipo] = useState(() => Math.floor(Math.random() * 6));
  const [animando, setAnimando] = useState(animar);
  const t = useRef(new Animated.Value(animar ? 0 : 1)).current;

  useEffect(() => {
    if (!animar) return undefined;
    // mola mais mole e amortecida: chega devagar, passa um tiquinho do ponto e assenta
    const anim = Animated.spring(t, {
      toValue: 1,
      stiffness: 38,
      damping: 7.5,
      mass: 1,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished) setAnimando(false); });
    return () => anim.stop();
  }, []);

  const de = (inicio) => t.interpolate({ inputRange: [0, 1], outputRange: [inicio, 0] });
  const opacidade = t.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  let transform;
  if (tipo === 0) transform = [{ translateY: de(height * 0.3) }]; // de baixo
  else if (tipo === 1) transform = [{ translateX: de(-width * 0.55) }]; // da esquerda
  else if (tipo === 2) transform = [{ translateX: de(width * 0.55) }]; // da direita
  else if (tipo === 3) {
    // balançando: sobe girando de leve e vai balançando até parar
    transform = [
      { translateY: de(height * 0.12) },
      { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-5deg', '0deg'] }) },
    ];
  } else if (tipo === 4) transform = [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }]; // zoom
  else transform = [{ translateY: de(-height * 0.2) }]; // de cima

  return (
    <Animated.View
      renderToHardwareTextureAndroid={animando}
      shouldRasterizeIOS={animando}
      style={[style, { opacity: opacidade, transform }]}
    >
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────
// Destaque de sintaxe do editor (Studio) — leve de propósito: roda só nas
// linhas que estão realmente visíveis na tela (ver "janela" do editor mais
// abaixo), nunca no arquivo inteiro, pra não pesar em arquivos grandes.
// ─────────────────────────────────────────────────────────
const PALAVRAS_CHAVE_POR_LINGUAGEM = {
  js: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'default',
    'break', 'continue', 'class', 'extends', 'new', 'this', 'import', 'export', 'from', 'as', 'try', 'catch',
    'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'async', 'await', 'yield', 'static', 'get', 'set',
    'null', 'undefined', 'true', 'false', 'void', 'delete', 'super', 'do'],
  java: ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'new', 'return', 'if',
    'else', 'for', 'while', 'switch', 'case', 'default', 'break', 'continue', 'import', 'package', 'static',
    'final', 'void', 'int', 'long', 'float', 'double', 'boolean', 'char', 'byte', 'short', 'this', 'super',
    'try', 'catch', 'finally', 'throw', 'throws', 'null', 'true', 'false', 'instanceof', 'abstract',
    'synchronized', 'volatile', 'enum', 'do'],
  py: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'import', 'from',
    'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'pass', 'None', 'True', 'False', 'and', 'or',
    'not', 'in', 'is', 'yield', 'global', 'nonlocal', 'async', 'await', 'self', 'del'],
};

// Extensões tratadas como texto ao ADICIONAR um arquivo existente pelo
// seletor do celular (adicionarArquivo). Antes, qualquer arquivo importado
// virava "binário" e nunca abria no editor — mesmo sendo um .java/.js/.txt
// grande. Agora, se a extensão for reconhecida, o conteúdo é lido como
// texto e cai em `conteudos` (abre e edita normal), não importa o tamanho.
const EXTENSOES_TEXTO = new Set([
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'java', 'kt', 'kts', 'py',
  'xml', 'json', 'css', 'scss', 'html', 'htm', 'md', 'txt',
  'gradle', 'properties', 'yml', 'yaml', 'ini', 'cfg', 'env',
  'sh', 'c', 'h', 'cpp', 'go', 'rs', 'rb', 'php', 'sql', 'csv', 'pro',
  'svg', 'aidl', 'smali', 'bat', 'lua', 'dart', 'swift', 'toml', 'log', 'tsv',
  'conf', 'rules', 'plist', 'xsd', 'vue', 'less', 'sass', 'gitignore', 'bak',
]);
// Arquivos de texto que não têm extensão (ou só têm o "ponto" do início).
const NOMES_TEXTO_SEM_EXTENSAO = new Set([
  'dockerfile', 'makefile', 'license', 'readme', 'gradlew', 'procfile',
  '.gitignore', '.gitattributes', '.editorconfig', '.env',
]);
// Extensões que a gente já sabe que são binárias — nem perde tempo
// espiando o conteúdo.
const EXTENSOES_BINARIAS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'mp3', 'ogg', 'wav', 'm4a', 'flac',
  'mp4', 'mkv', 'webm', 'avi', 'zip', 'jar', 'aar', 'apk', 'dex', 'so', 'class', 'gz', 'tar',
  '7z', 'rar', 'ttf', 'otf', 'woff', 'woff2', 'pdf', 'glb', 'fbx', 'bin', 'db', 'keystore', 'jks',
]);
function ehExtensaoTexto(nome) {
  const n = String(nome || '').toLowerCase();
  if (NOMES_TEXTO_SEM_EXTENSAO.has(n)) return true;
  const m = /\.([a-zA-Z0-9]+)$/.exec(n);
  return !!m && EXTENSOES_TEXTO.has(m[1]);
}
function ehExtensaoBinaria(nome) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(String(nome || '').toLowerCase());
  return !!m && EXTENSOES_BINARIAS.has(m[1]);
}

// Extensão do arquivo → linguagem reconhecida (null = sem destaque, mostra
// o texto normal como sempre mostrou).
function detectarLinguagem(caminho) {
  if (!caminho) return null;
  const m = /\.([a-zA-Z0-9]+)$/.exec(caminho);
  const ext = m ? m[1].toLowerCase() : '';
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext)) return 'js';
  if (ext === 'java') return 'java';
  if (ext === 'py') return 'py';
  if (ext === 'xml') return 'xml';
  if (ext === 'json') return 'json';
  if (['css', 'scss'].includes(ext)) return 'css';
  return null;
}

// Uma regex "cacheada" por linguagem (monta uma vez só, reaproveita sempre).
const CACHE_REGEX_LINGUAGEM = {};
function obterRegexLinguagem(ling) {
  if (!ling) return null;
  if (CACHE_REGEX_LINGUAGEM[ling]) return CACHE_REGEX_LINGUAGEM[ling];
  const partes = [];
  if (ling === 'py') partes.push('(?<comentario>#.*)');
  else if (ling === 'xml') partes.push('(?<comentario><!--[\\s\\S]*?-->)');
  else if (ling !== 'json') partes.push('(?<comentario>//.*|/\\*[\\s\\S]*?\\*/)');
  partes.push(
    "(?<string>\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'" +
    (ling === 'js' ? '|`(?:[^`\\\\]|\\\\.)*`' : '') + ')'
  );
  if (ling === 'xml') {
    partes.push('(?<tag></?[a-zA-Z_][\\w:.-]*)');
    partes.push('(?<atributo>[a-zA-Z_][\\w:-]*(?=\\s*=))');
  }
  partes.push('(?<numero>\\b\\d+\\.?\\d*\\b)');
  const chaves = PALAVRAS_CHAVE_POR_LINGUAGEM[ling];
  if (chaves && chaves.length) partes.push('(?<chave>\\b(?:' + chaves.join('|') + ')\\b)');
  const regex = new RegExp(partes.join('|'), 'g');
  CACHE_REGEX_LINGUAGEM[ling] = regex;
  return regex;
}

function corDoGrupo(grupos) {
  if (!grupos) return null;
  if (grupos.comentario) return COLORS.syntaxComment;
  if (grupos.string) return COLORS.syntaxString;
  if (grupos.numero) return COLORS.syntaxNumber;
  if (grupos.chave) return COLORS.syntaxKeyword;
  if (grupos.tag) return COLORS.syntaxTag;
  if (grupos.atributo) return COLORS.syntaxAttr;
  return null;
}

// Quebra UMA linha em pedaços coloridos. Só é chamada pras linhas que estão
// de fato na tela (ver janela do editor) — nunca pro arquivo inteiro.
function tokenizarLinha(linha, regex) {
  if (!regex || !linha) return [{ t: linha || '', c: null }];
  regex.lastIndex = 0;
  const partes = [];
  let ultimo = 0;
  let m;
  while ((m = regex.exec(linha))) {
    if (m.index > ultimo) partes.push({ t: linha.slice(ultimo, m.index), c: null });
    partes.push({ t: m[0], c: corDoGrupo(m.groups) });
    ultimo = m.index + m[0].length;
    if (m[0].length === 0) regex.lastIndex += 1; // trava de segurança contra loop infinito
  }
  if (ultimo < linha.length) partes.push({ t: linha.slice(ultimo), c: null });
  return partes;
}

function hexParaRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─────────────────────────────────────────────────────────
// Etapas fixas do build (usadas só pra desenhar o "stepper" bonito do
// painel de compilação — o texto real de cada linha continua vindo do
// apk-builder nativo, aqui a gente só casa "N/6" com o passo certo).
// ─────────────────────────────────────────────────────────
// Texto único mostrado no lugar de qualquer erro interno (exceção, falha do
// compilador, módulo nativo ausente etc). O detalhe real nunca vai pra tela.
const TITULO_MANUTENCAO = 'Em manutenção';
const MSG_MANUTENCAO = 'Estamos em manutenção. Resolvemos em breve.';

const STEPS_COMPILACAO = [
  { icone: 'image-multiple-outline', titulo: 'Recursos', sub: 'Preparando imagens e textos' },
  { icone: 'link-variant', titulo: 'Link', sub: 'Conectando o app' },
  { icone: 'language-java', titulo: 'Java', sub: 'Compilando o código' },
  { icone: 'file-cog-outline', titulo: 'Dex', sub: 'Otimizando o código' },
  { icone: 'package-variant-closed', titulo: 'Empacotar', sub: 'Montando o app' },
  { icone: 'shield-check-outline', titulo: 'Assinar', sub: 'Assinando o app' },
];

// Textos amigáveis do log do build (o log cru do módulo nativo tem nomes
// técnicos — aapt2, android.jar, ECJ, D8... — que o painel não mostra).
const TEXTOS_ETAPAS_LOG = [
  'Preparando imagens e textos',
  'Conectando o app',
  'Compilando o código',
  'Otimizando o código',
  'Montando o app',
  'Assinando o app',
];
const REGEX_LINHA_TECNICA = /aapt2|android\.jar|\bECJ\b|\bD8\b|apksig|\.class\b|\.dex\b|resources\.arsc|R\.java|libaapt|zipalign/i;

// Lê uma linha de progresso do módulo nativo no formato "N/M ..." (hoje "N/6"
// ou "N/7"; o total pode mudar). Devolve { n, m, etapa (0..6), valor (0..6) }.
function lerLinhaProgresso(linha) {
  const x = /^(\d+)\/(\d+)\b/.exec(String(linha || '').trim());
  if (!x) return null;
  const n = parseInt(x[1], 10);
  const m = parseInt(x[2], 10);
  if (!(m > 0)) return null;
  const total = STEPS_COMPILACAO.length;
  const valor = m === total ? Math.min(n, total) : Math.max(0, Math.min(total, (n / m) * total));
  return { n, m, etapa: Math.min(total, Math.ceil(valor - 1e-9)), valor };
}

// Converte o log cru em itens bonitos: { tipo: 'etapa'|'info'|'erro', texto, numero }.
function montarLogAmigavel(logCru) {
  const itens = [];
  let ultimoDownload = -1;
  let ultimaProtecao = -1;
  logCru.forEach((linha) => {
    const bruta = String(linha || '').trim();
    if (!bruta) return;
    const prog = lerLinhaProgresso(bruta);
    if (prog) {
      if (prog.etapa >= 1) {
        const ult = itens[itens.length - 1];
        if (!(ult && ult.tipo === 'etapa' && ult.numero === prog.etapa)) {
          itens.push({ tipo: 'etapa', numero: prog.etapa, texto: TEXTOS_ETAPAS_LOG[prog.etapa - 1] });
        }
      } else {
        const item = { tipo: 'info', texto: 'Preparando proteções…' };
        if (ultimaProtecao >= 0) itens[ultimaProtecao] = item; else { ultimaProtecao = itens.length; itens.push(item); }
      }
      return;
    }
    if (/^baixando/i.test(bruta)) {
      const pct = /(\d+)\s*%/.exec(bruta);
      const item = { tipo: 'info', texto: pct ? `Baixando ferramentas… ${pct[1]}%` : 'Baixando ferramentas…' };
      if (ultimoDownload >= 0) itens[ultimoDownload] = item; else { ultimoDownload = itens.length; itens.push(item); }
      return;
    }
    if (/^preparando/i.test(bruta)) {
      itens.push({ tipo: 'info', texto: 'Preparando ferramentas…' });
      return;
    }
    const falhou = /^falhou na etapa:\s*(.*)$/i.exec(bruta);
    if (falhou) {
      itens.push({ tipo: 'erro', texto: MSG_MANUTENCAO });
      return;
    }
    if (/^erro:/i.test(bruta)) {
      itens.push({ tipo: 'erro', texto: MSG_MANUTENCAO });
      return;
    }
    if (REGEX_LINHA_TECNICA.test(bruta)) return; // linha técnica: esconde
    itens.push({ tipo: 'info', texto: bruta });
  });
  return itens;
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
    sucesso: { icon: 'check-circle', cor: COLORS.gold, badge: 'rgba(255,122,217,0.14)' },
    aviso: { icon: 'information', cor: COLORS.gold, badge: 'rgba(255,122,217,0.14)' },
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
    backgroundColor: '#1a1430',
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
// Só o robozinho do Android: qualquer outro visual vem de uma foto da galeria.
const ICONES_APP_STUDIO = ['android'];
// Quando o app usa foto no lugar do ícone padrão, o PNG entra aqui (e o
// ic_launcher.xml deixa de existir — os dois com o mesmo nome dariam
// recurso duplicado no aapt2).
const ICONE_FOTO_CAMINHO = 'app/src/main/res/drawable/ic_launcher.png';
const PASTA_ICONES_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_icones/`;
const CORES_ICONE_STUDIO = ['#b43cff', '#4f46ff', '#38bdf8', '#34d399', '#ff7ad9', '#ff2fc6', '#8b5cf6', '#60a5fa'];

// Ícone + cor por extensão de arquivo, pro explorador do CindraStudio
// (parecido com iconeArquivo(), só que cobrindo extensões de projeto
// Android — .java, .xml, .gradle — que a Biblioteca não usa).
function iconeArquivoStudio(nome) {
  const ext = String(nome || '').split('.').pop().toLowerCase();
  const MAPA = {
    java: { icon: 'language-java', color: '#f89820' },
    kt: { icon: 'language-kotlin', color: '#7f52ff' },
    xml: { icon: 'code-tags', color: '#00acc1' },
    html: { icon: 'language-html5', color: '#ff6bd6' },
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

// Nome "de gente" do tipo do arquivo (aparece na folha e nos avisos).
const ROTULOS_ARQUIVO_STUDIO = {
  java: 'Java', kt: 'Kotlin', xml: 'XML', json: 'JSON', html: 'HTML', css: 'CSS', js: 'JavaScript',
  ts: 'TypeScript', py: 'Python', md: 'Markdown', txt: 'Texto', gradle: 'Gradle', properties: 'Propriedades',
  yml: 'YAML', yaml: 'YAML', svg: 'Imagem SVG', png: 'Imagem PNG', jpg: 'Imagem JPG', jpeg: 'Imagem JPEG',
  gif: 'Imagem GIF', webp: 'Imagem WebP', mp3: 'Som MP3', ogg: 'Som OGG', wav: 'Som WAV', mp4: 'Vídeo MP4',
  zip: 'Arquivo ZIP', jar: 'Biblioteca JAR', aar: 'Biblioteca AAR', apk: 'APK', so: 'Biblioteca nativa',
  ttf: 'Fonte TTF', otf: 'Fonte OTF', pdf: 'PDF', glb: 'Modelo 3D', gltf: 'Modelo 3D', obj: 'Modelo 3D',
  sql: 'SQL', csv: 'Planilha CSV', pro: 'Regras ProGuard', sh: 'Script shell',
};
function descreverArquivoStudio(nome, ehTexto) {
  const n = String(nome || '');
  const m = /\.([a-zA-Z0-9]+)$/.exec(n);
  const ext = m ? m[1].toLowerCase() : '';
  const rotulo = ROTULOS_ARQUIVO_STUDIO[ext] || (ext ? ext.toUpperCase() : 'Arquivo');
  const modo = ehTexto === undefined ? '' : ehTexto ? 'editável' : 'binário';
  return { rotulo, modo, texto: modo ? `${rotulo} · ${modo}` : rotulo };
}
function formatarTamanhoStudio(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}
// Extensão desconhecida? Espia os primeiros 4 KB: sem byte 0 e com poucos
// caracteres de controle = texto (abre no editor); senão = binário.
async function pareceTextoPorConteudo(uri) {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: 0, length: 4096 });
    const bytes = base64ParaBytes(b64);
    if (!bytes.length) return true;
    let estranhos = 0;
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b === 0) return false;
      if (b < 9 || (b > 13 && b < 32)) estranhos++;
    }
    return estranhos / bytes.length < 0.02;
  } catch (e) {
    return false;
  }
}
// Sugestões de nome ao criar pasta, conforme onde a pasta nova vai ficar.
function sugestoesPastaStudio(caminhoPai, filhos) {
  const base = /\/res$/.test(caminhoPai)
    ? ['drawable', 'layout', 'values', 'menu', 'mipmap-hdpi', 'raw']
    : /\/main$/.test(caminhoPai)
      ? ['java', 'res', 'assets']
      : ['res', 'assets', 'libs', 'drawable', 'layout', 'values', 'raw'];
  const existentes = new Set((filhos || []).map((f) => f.nome));
  return base.filter((n) => !existentes.has(n)).slice(0, 5);
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
function montarProjetoNovo(nomeApp, nomePacoteBruto, corIcone, comFoto = false) {
  const nomePacote = normalizarPacote(nomePacoteBruto);
  const cor = /^#[0-9a-fA-F]{6}$/.test(corIcone || '') ? corIcone : '#b43cff';
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
        android:allowBackup="false"
        android:icon="@drawable/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.App">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="portrait"
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
// A marca d'água "Cindra Studio" NÃO fica aqui — ela é aplicada
// automaticamente em todo app gerado (veja CindraWatermarkApp.java).
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

  // Com foto: o ícone é o PNG (binário, gravado depois em criarProjeto).
  if (comFoto) delete conteudos[iconePath];

  // Transforma o mapa de caminhos num array de nós (pastas/arquivos)
  // pro explorador desenhar em árvore.
  const raiz = [];
  const caminhosArvore = comFoto ? Object.keys(conteudos).concat(ICONE_FOTO_CAMINHO) : Object.keys(conteudos);
  caminhosArvore.forEach((caminho) => {
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
  const binarios = comFoto ? { [ICONE_FOTO_CAMINHO]: { tamanho: 0 } } : {};
  return { arvore, conteudos, binarios, arquivoInicial: mainActivityPath, pacote: nomePacote };
}

// Pasta do projeto no armazenamento interno do app — é daqui que o
// compilador nativo (próxima etapa) vai ler os arquivos.
function pastaProjetoStudio(pacote) {
  return `${FileSystem.documentDirectory}cindrastudio/${pacote}/`;
}

// Nome da classe Application injetada em todo projeto — fixo, pra o
// manifest sempre poder apontar pra ela.
const MARCA_DAGUA_CLASSE = 'CindraWatermarkApp';

// Código secreto que tira a marca d'água. Fica guardado só como "assinatura"
// (hash), então o código em si não aparece escrito no arquivo. Depois de
// digitado certo UMA vez, o aparelho lembra pra sempre (salvo em _prefs.json).
const ASSINATURA_CODIGO_SEM_MARCA = '601f6bc84784230e76';
let MARCA_REMOVIDA_STUDIO = false;
function assinaturaCodigoStudio(txt) {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < txt.length; i++) {
    const c = txt.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = (Math.imul(b, 33) + c) >>> 0;
  }
  const hex = (n) => ('00000000' + n.toString(16)).slice(-8);
  return hex(a) + hex(b) + txt.length;
}
function codigoSemMarcaValido(txt) {
  return assinaturaCodigoStudio(String(txt || '').trim()) === ASSINATURA_CODIGO_SEM_MARCA;
}

// Gera o Application.java que desenha a marca d'água "Cindra Studio"
// por cima de QUALQUER Activity do app, sem depender de nada que o
// MainActivity faça. Usa registerActivityLifecycleCallbacks: funciona
// mesmo que a pessoa reescreva o MainActivity inteiro.
function gerarFonteMarcaDagua(nomePacote) {
  return `package ${nomePacote};

import android.app.Activity;
import android.app.Application;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

// Gerado automaticamente pelo CindraStudio — não remova nem desligue:
// é reescrito a cada compilação. Desenha "Cindra Studio" num cantinho
// inferior de toda tela do app, registrando um callback de ciclo de
// vida que roda pra qualquer Activity, não só a MainActivity — então
// funciona em retrato ou paisagem, do mesmo jeito.
public class ${MARCA_DAGUA_CLASSE} extends Application {

    private static final String MARCA_TAG = "cindrastudio_marca_dagua";
    private static final boolean MARCA_ATIVA = ${MARCA_REMOVIDA_STUDIO ? 'false' : 'true'};

    @Override
    public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override
            public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
                inserirMarca(activity);
            }

            // Reforço: cobre casos em que a tela ainda não tinha layout
            // pronto na criação (ex.: Activity recriada numa rotação).
            @Override
            public void onActivityResumed(Activity activity) {
                inserirMarca(activity);
            }

            @Override public void onActivityStarted(Activity activity) {}
            @Override public void onActivityPaused(Activity activity) {}
            @Override public void onActivityStopped(Activity activity) {}
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
            @Override public void onActivityDestroyed(Activity activity) {}
        });
    }

    private static int dp(Activity activity, float valor) {
        return Math.round(valor * activity.getResources().getDisplayMetrics().density);
    }

    private static void inserirMarca(final Activity activity) {
        if (!MARCA_ATIVA) return;
        final View decorView = activity.getWindow().getDecorView();
        decorView.post(new Runnable() {
            @Override
            public void run() {
                if (!(decorView instanceof ViewGroup)) return;
                ViewGroup decor = (ViewGroup) decorView;
                if (decor.findViewWithTag(MARCA_TAG) != null) return;

                TextView marca = new TextView(activity);
                marca.setTag(MARCA_TAG);
                marca.setText("Cindra Studio");
                marca.setTextColor(Color.WHITE);
                marca.setTypeface(Typeface.DEFAULT_BOLD);
                marca.setTextSize(11);
                marca.setLetterSpacing(0.08f);
                marca.setGravity(Gravity.CENTER);
                marca.setAlpha(0.7f);
                marca.setClickable(false);
                marca.setFocusable(false);
                marca.setFocusableInTouchMode(false);
                int padH = dp(activity, 10);
                int padV = dp(activity, 5);
                marca.setPadding(padH, padV, padH, padV);

                GradientDrawable fundo = new GradientDrawable();
                fundo.setColor(Color.parseColor("#33000000"));
                fundo.setCornerRadius(dp(activity, 14));
                marca.setBackground(fundo);

                FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                lp.gravity = Gravity.BOTTOM | Gravity.END;
                lp.bottomMargin = dp(activity, 16);
                lp.setMarginEnd(dp(activity, 16));

                decor.addView(marca, lp);
            }
        });
    }
}
`;
}

// Garante que o manifest aponte pra android:name=".CindraWatermarkApp"
// na tag <application>, trocando o que já estiver lá (se a pessoa
// apagar esse atributo ou colocar outro valor, volta sempre pro nosso).
function forcarAppNaManifest(xmlManifest) {
  if (/<application\b[^>]*\sandroid:name="[^"]*"/.test(xmlManifest)) {
    return xmlManifest.replace(
      /(<application\b[^>]*\sandroid:name=")[^"]*(")/,
      `$1.${MARCA_DAGUA_CLASSE}$2`
    );
  }
  return xmlManifest.replace(
    /<application\b/,
    `<application\n        android:name=".${MARCA_DAGUA_CLASSE}"`
  );
}

// Reaplica a marca d'água obrigatória num conjunto de conteúdos de
// projeto: reescreve/recria o Application.java e força o manifest a
// usá-lo. Roda sempre em gravarProjetoStudio, então vale tanto pra
// projeto novo quanto pra qualquer projeto já existente que for
// salvo/compilado — e sobrescreve qualquer tentativa de remover,
// desde que o editor rode esse save antes de compilar.
function aplicarMarcaDaguaObrigatoria(projeto) {
  const pkgPath = pacotePraCaminho(projeto.pacote);
  const manifestPath = 'app/src/main/AndroidManifest.xml';
  const marcaPath = `app/src/main/java/${pkgPath}/${MARCA_DAGUA_CLASSE}.java`;

  const conteudos = { ...projeto.conteudos };
  conteudos[marcaPath] = gerarFonteMarcaDagua(projeto.pacote);
  if (conteudos[manifestPath]) {
    conteudos[manifestPath] = forcarAppNaManifest(conteudos[manifestPath]);
  }

  let arvore = projeto.arvore;
  if (!arvoreTemCaminho(arvore, marcaPath)) {
    const pastaJava = marcaPath.split('/').slice(0, -1).join('/');
    arvore = inserirNoNaArvore(arvore, pastaJava, {
      nome: `${MARCA_DAGUA_CLASSE}.java`,
      caminho: marcaPath,
      tipo: 'arquivo',
    });
  }

  return { ...projeto, conteudos, arvore };
}

// Grava o projeto inteiro em disco, um arquivo por caminho. Apaga a
// pasta antes pra arquivo removido/renomeado não ficar sobrando lá.
async function gravarProjetoStudio(projetoOriginal) {
  const projeto = aplicarMarcaDaguaObrigatoria(projetoOriginal);
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

// Devolve o nó (pasta ou arquivo) que está em `caminho`, ou null.
function acharNoNaArvore(nos, caminho) {
  for (const no of nos) {
    if (no.caminho === caminho) return no;
    if (no.tipo === 'pasta') {
      const achado = acharNoNaArvore(no.filhos, caminho);
      if (achado) return achado;
    }
  }
  return null;
}

function arvoreTemCaminho(nos, caminho) {
  return nos.some((no) => no.caminho === caminho || (no.tipo === 'pasta' && arvoreTemCaminho(no.filhos, caminho)));
}

// Insere o arquivo na árvore criando as pastas do caminho que ainda não
// existem (ex.: drawable-nodpi, values-v31). Não duplica.
function garantirArquivoNaArvore(arvore, caminho) {
  if (arvoreTemCaminho(arvore, caminho)) return arvore;
  const partes = caminho.split('/');
  let nova = arvore;
  for (let i = 0; i < partes.length - 1; i += 1) {
    const alvo = partes.slice(0, i + 1).join('/');
    if (!arvoreTemCaminho(nova, alvo)) {
      const no = { nome: partes[i], caminho: alvo, tipo: 'pasta', filhos: [] };
      nova = i === 0 ? nova.concat(no) : inserirNoNaArvore(nova, partes.slice(0, i).join('/'), no);
    }
  }
  return inserirNoNaArvore(nova, partes.slice(0, -1).join('/'), { nome: partes[partes.length - 1], caminho, tipo: 'arquivo' });
}

// ─────────────────────────────────────────────────────────
// Exportar o projeto como .zip (sem módulo nativo): escritor de ZIP em JS
// puro (método "stored", sem compressão — compatível com qualquer
// descompactador), mais base64/UTF-8/CRC32 próprios pra não depender de
// TextEncoder/btoa.
// ─────────────────────────────────────────────────────────
const BASE64_ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_INVERSO = (() => {
  const t = new Uint8Array(256).fill(255);
  for (let i = 0; i < BASE64_ALFABETO.length; i += 1) t[BASE64_ALFABETO.charCodeAt(i)] = i;
  return t;
})();

function base64ParaBytes(b64) {
  const limpo = String(b64 || '').replace(/[^A-Za-z0-9+/]/g, '');
  const saida = new Uint8Array(Math.floor((limpo.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < limpo.length; i += 4) {
    const a = BASE64_INVERSO[limpo.charCodeAt(i)];
    const b = BASE64_INVERSO[limpo.charCodeAt(i + 1)];
    const c = i + 2 < limpo.length ? BASE64_INVERSO[limpo.charCodeAt(i + 2)] : 0;
    const d = i + 3 < limpo.length ? BASE64_INVERSO[limpo.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < saida.length) saida[o++] = (n >> 16) & 255;
    if (o < saida.length) saida[o++] = (n >> 8) & 255;
    if (o < saida.length) saida[o++] = n & 255;
  }
  return saida;
}

function bytesParaBase64(bytes) {
  const partes = [];
  let atual = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((i + 1 < bytes.length ? bytes[i + 1] : 0) << 8) | (i + 2 < bytes.length ? bytes[i + 2] : 0);
    atual += BASE64_ALFABETO[(n >> 18) & 63] + BASE64_ALFABETO[(n >> 12) & 63]
      + (i + 1 < bytes.length ? BASE64_ALFABETO[(n >> 6) & 63] : '=')
      + (i + 2 < bytes.length ? BASE64_ALFABETO[n & 63] : '=');
    if (atual.length >= 24000) { partes.push(atual); atual = ''; }
  }
  partes.push(atual);
  return partes.join('');
}

function textoParaBytes(str) {
  const out = [];
  const t = String(str);
  for (let i = 0; i < t.length; i += 1) {
    let c = t.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < t.length) {
      const d = t.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i += 1; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

const TABELA_CRC32 = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32Bytes(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = TABELA_CRC32[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// entradas: [{ nome: 'pasta/arquivo.txt' (termina em "/" = pasta), bytes: Uint8Array }]
function montarZipStudio(entradas) {
  if (entradas.length > 65000) throw new Error('Arquivos demais pra um .zip simples.');
  const agora = new Date();
  const dosHora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
  const dosData = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
  const locais = [];
  const centrais = [];
  let deslocamento = 0;
  let tamLocais = 0;
  let tamCentrais = 0;
  for (const e of entradas) {
    const nome = textoParaBytes(e.nome);
    const dados = e.bytes;
    const crc = crc32Bytes(dados);
    const ehPasta = e.nome.endsWith('/');

    const lh = new Uint8Array(30 + nome.length);
    const dl = new DataView(lh.buffer);
    dl.setUint32(0, 0x04034b50, true);
    dl.setUint16(4, 20, true);
    dl.setUint16(6, 0x0800, true); // nomes em UTF-8
    dl.setUint16(8, 0, true); // stored
    dl.setUint16(10, dosHora, true);
    dl.setUint16(12, dosData, true);
    dl.setUint32(14, crc, true);
    dl.setUint32(18, dados.length, true);
    dl.setUint32(22, dados.length, true);
    dl.setUint16(26, nome.length, true);
    dl.setUint16(28, 0, true);
    lh.set(nome, 30);

    const ch = new Uint8Array(46 + nome.length);
    const dc = new DataView(ch.buffer);
    dc.setUint32(0, 0x02014b50, true);
    dc.setUint16(4, 20, true);
    dc.setUint16(6, 20, true);
    dc.setUint16(8, 0x0800, true);
    dc.setUint16(10, 0, true);
    dc.setUint16(12, dosHora, true);
    dc.setUint16(14, dosData, true);
    dc.setUint32(16, crc, true);
    dc.setUint32(20, dados.length, true);
    dc.setUint32(24, dados.length, true);
    dc.setUint16(28, nome.length, true);
    dc.setUint32(38, ehPasta ? 0x10 : 0, true);
    dc.setUint32(42, deslocamento, true);
    ch.set(nome, 46);

    locais.push(lh, dados);
    centrais.push(ch);
    deslocamento += lh.length + dados.length;
    tamLocais += lh.length + dados.length;
    tamCentrais += ch.length;
  }
  const fim = new Uint8Array(22);
  const df = new DataView(fim.buffer);
  df.setUint32(0, 0x06054b50, true);
  df.setUint16(8, entradas.length, true);
  df.setUint16(10, entradas.length, true);
  df.setUint32(12, tamCentrais, true);
  df.setUint32(16, tamLocais, true);

  const zip = new Uint8Array(tamLocais + tamCentrais + 22);
  let pos = 0;
  for (const parte of locais) { zip.set(parte, pos); pos += parte.length; }
  for (const parte of centrais) { zip.set(parte, pos); pos += parte.length; }
  zip.set(fim, pos);
  return zip;
}

// Pastas vazias da árvore (pra irem no .zip também).
function pastasVaziasDaArvore(nos, acc = []) {
  for (const no of nos) {
    if (no.tipo !== 'pasta') continue;
    if (no.filhos.length === 0) acc.push(no.caminho);
    else pastasVaziasDaArvore(no.filhos, acc);
  }
  return acc;
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

// ─────────────────────────────────────────────────────────
// Histórico de APKs gerados (aba "Gerados"). Cada compilação com sucesso
// vira um registro em _builds.json e o APK fica guardado com nome único em
// _out/<pacote>/ (antes cada build sobrescrevia o anterior). O ícone do app
// no momento do build é copiado pra _builds/ pra não sumir se a pessoa
// trocar a foto do app depois.
// ─────────────────────────────────────────────────────────
const ARQUIVO_BUILDS_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_builds.json`;
const PASTA_ICONES_BUILDS_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_builds/`;

async function lerBuildsStudio() {
  try {
    const info = await FileSystem.getInfoAsync(ARQUIVO_BUILDS_STUDIO);
    if (!info.exists) return [];
    const texto = await FileSystem.readAsStringAsync(ARQUIVO_BUILDS_STUDIO, { encoding: FileSystem.EncodingType.UTF8 });
    const lista = JSON.parse(texto);
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
}

async function gravarBuildsStudio(lista) {
  await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}cindrastudio/`, { intermediates: true });
  await FileSystem.writeAsStringAsync(ARQUIVO_BUILDS_STUDIO, JSON.stringify(lista), { encoding: FileSystem.EncodingType.UTF8 });
}

// Varre a pasta _out/ e inclui no histórico os APKs que já estavam salvos
// no celular e ainda não estão registrados: os das versões antigas (um
// arquivo <pacote>.apk / <pacote>-release.apk por app, sobrescrito a cada
// build) e qualquer APK solto nas subpastas. Não move nem apaga nada; usa
// a data de modificação do arquivo e pega nome/ícone do projeto na lista.
async function importarApksExistentesStudio(builds, projetos) {
  const raiz = `${FileSystem.documentDirectory}cindrastudio/_out/`;
  let nomes = [];
  try {
    const info = await FileSystem.getInfoAsync(raiz);
    if (!info.exists) return builds;
    nomes = await FileSystem.readDirectoryAsync(raiz);
  } catch (e) {
    return builds;
  }
  const jaTem = new Set(builds.map((b) => b.apk));
  const novos = [];

  const acharProjeto = (pacote) => (projetos || []).find((x) => x.pacote === pacote) || null;
  const adicionar = async (uri, pacote, release, nomeArq) => {
    if (jaTem.has(uri)) return;
    let info;
    try { info = await FileSystem.getInfoAsync(uri); } catch (e) { return; }
    if (!info || !info.exists || info.isDirectory) return;
    const proj = acharProjeto(pacote);
    const ultimoTrecho = String(pacote).split('.').pop() || pacote;
    novos.push({
      id: `disco_${pacote}_${nomeArq}`,
      pacote,
      nomeApp: (proj && proj.nomeApp) || ultimoTrecho,
      tipo: release ? 'release' : 'debug',
      versaoNome: proj && proj.versaoNome ? proj.versaoNome : null,
      versaoCodigo: null,
      criadoEm: info.modificationTime ? Math.round(info.modificationTime * 1000) : Date.now(),
      apk: uri,
      tamanho: info.size || 0,
      fotoIcone: (proj && proj.fotoIcone) || null,
      corIcone: (proj && proj.corIcone) || CORES_ICONE_STUDIO[0],
      iconeEscolhido: (proj && proj.iconeEscolhido) || ICONES_APP_STUDIO[0],
      antigo: true,
    });
    jaTem.add(uri);
  };

  for (const nome of nomes) {
    if (/\.apk$/i.test(nome)) {
      const base = nome.replace(/\.apk$/i, '');
      const release = /-release$/.test(base);
      await adicionar(`${raiz}${nome}`, release ? base.replace(/-release$/, '') : base, release, nome);
    } else {
      // subpasta <pacote>/ com APKs soltos (build que não chegou a ser registrado)
      let filhos = [];
      try { filhos = await FileSystem.readDirectoryAsync(`${raiz}${nome}`); } catch (e) { filhos = []; }
      for (const f of filhos) {
        if (!/\.apk$/i.test(f)) continue;
        await adicionar(`${raiz}${nome}/${f}`, nome, /-release\.apk$/i.test(f), f);
      }
    }
  }
  return novos.length ? novos.concat(builds) : builds;
}

// Acha a foto de ícone REAL de um app: a da lista de projetos, a que está
// gravada na pasta do projeto (binários) ou no estado salvo. Se achar, faz
// uma cópia estável em _builds/ (sobrevive à exclusão do projeto).
async function resolverIconeAppStudio(pacote, projetos) {
  const existe = async (uri) => {
    try {
      const i = await FileSystem.getInfoAsync(uri);
      return !!(i && i.exists && !i.isDirectory);
    } catch (e) {
      return false;
    }
  };
  const proj = (projetos || []).find((x) => x.pacote === pacote) || null;
  const candidatos = [];
  if (proj && proj.fotoIcone) candidatos.push(proj.fotoIcone);
  candidatos.push(pastaBinariosStudio(pacote) + ICONE_FOTO_CAMINHO);
  candidatos.push(pastaProjetoStudio(pacote) + ICONE_FOTO_CAMINHO);
  let estado = null;
  if (!proj) {
    // projeto fora da lista: o estado salvo ainda pode ter a foto
    estado = await lerEstadoStudio(pacote);
    if (estado && estado.fotoIcone) candidatos.push(estado.fotoIcone);
  }
  let achada = null;
  for (const c of candidatos) {
    if (await existe(c)) { achada = c; break; }
  }
  const cor = (proj && proj.corIcone) || (estado && estado.corIcone) || null;
  const icone = (proj && proj.iconeEscolhido) || (estado && estado.iconeEscolhido) || null;
  if (!achada) return { fotoIcone: null, corIcone: cor, iconeEscolhido: icone };
  if (achada.indexOf(PASTA_ICONES_BUILDS_STUDIO) === 0) return { fotoIcone: achada, corIcone: cor, iconeEscolhido: icone };
  try {
    await FileSystem.makeDirectoryAsync(PASTA_ICONES_BUILDS_STUDIO, { intermediates: true });
    const destino = `${PASTA_ICONES_BUILDS_STUDIO}${pacote}_icone.png`;
    await FileSystem.copyAsync({ from: achada, to: destino }).catch(async () => {
      await FileSystem.deleteAsync(destino, { idempotent: true });
      await FileSystem.copyAsync({ from: achada, to: destino });
    });
    return { fotoIcone: destino, corIcone: cor, iconeEscolhido: icone };
  } catch (e) {
    return { fotoIcone: achada, corIcone: cor, iconeEscolhido: icone };
  }
}

// Completa o ícone dos builds que estão sem foto (ou cuja foto sumiu).
async function completarIconesBuildsStudio(builds, projetos) {
  const precisam = {};
  for (const b of builds) {
    let ok = false;
    if (b.fotoIcone) {
      try {
        const i = await FileSystem.getInfoAsync(b.fotoIcone);
        ok = !!(i && i.exists);
      } catch (e) { ok = false; }
    }
    if (!ok) precisam[b.pacote] = true;
  }
  const pacotes = Object.keys(precisam);
  if (!pacotes.length) return { lista: builds, mudou: false };
  const achados = {};
  for (const pk of pacotes) achados[pk] = await resolverIconeAppStudio(pk, projetos);
  let mudou = false;
  const lista = builds.map((b) => {
    const a = achados[b.pacote];
    if (!a) return b;
    const novo = {
      ...b,
      fotoIcone: a.fotoIcone,
      corIcone: a.corIcone || b.corIcone,
      iconeEscolhido: a.iconeEscolhido || b.iconeEscolhido,
    };
    if (novo.fotoIcone !== b.fotoIcone || novo.corIcone !== b.corIcone || novo.iconeEscolhido !== b.iconeEscolhido) mudou = true;
    return novo;
  });
  return { lista, mudou };
}

// ─────────────────────────────────────────────────────────
// Pasta pública: toda APK gerada também é copiada pra
// /storage/emulated/0/cindra-studio (a pasta é criada sozinha, sem seletor).
// No Android 11+ isso exige "Acesso a todos os arquivos" liberado pro app
// (permissão MANAGE_EXTERNAL_STORAGE no app.json + liberar uma vez nas
// configurações). Sem a permissão a cópia só falha — o APK interno e a aba
// Gerados continuam funcionando normal.
// ─────────────────────────────────────────────────────────
const PASTA_PUBLICA_STUDIO = 'file:///storage/emulated/0/cindra-studio/';
const PASTA_PUBLICA_TEXTO = '/storage/emulated/0/cindra-studio';

function nomeArquivoPublicoStudio(b) {
  const limpo = (t) => {
    let x = String(t || '');
    try { if (x.normalize) x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* segue sem tirar acento */ }
    return x.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  };
  const d = new Date(b.criadoEm || Date.now());
  const dois = (n) => String(n).padStart(2, '0');
  const data = `${d.getFullYear()}${dois(d.getMonth() + 1)}${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}`;
  const base = limpo(b.nomeApp) || limpo(String(b.pacote || '').split('.').pop()) || 'app';
  const ver = b.versaoNome ? `-v${limpo(b.versaoNome)}` : '';
  return `${base}${ver}-${b.tipo === 'release' ? 'release' : 'debug'}-${data}.apk`;
}

// Testa se o app consegue mesmo escrever em /storage/emulated/0/cindra-studio
// (cria a pasta e grava/apaga um arquivinho de teste).
async function testarAcessoPastaPublicaStudio() {
  // Módulo nativo (java.io.File): não depende do expo-file-system.
  if (ApkBuilder.temPastaNativa) {
    try {
      const liberado = await ApkBuilder.temAcessoTodosArquivos();
      if (liberado === false) return false;
      return !!(await ApkBuilder.criarPasta(PASTA_PUBLICA_TEXTO));
    } catch (e) {
      return false;
    }
  }
  try {
    try {
      await FileSystem.makeDirectoryAsync(PASTA_PUBLICA_STUDIO, { intermediates: true });
    } catch (e) { /* o teste de escrita abaixo é quem decide */ }
    const teste = `${PASTA_PUBLICA_STUDIO}.cindra_teste`;
    await FileSystem.writeAsStringAsync(teste, 'ok', { encoding: FileSystem.EncodingType.UTF8 });
    await FileSystem.deleteAsync(teste, { idempotent: true }).catch(() => {});
    return true;
  } catch (e) {
    return false;
  }
}

async function copiarParaPastaPublicaStudio(b) {
  if (ApkBuilder.temPastaNativa) {
    try {
      // cindra-studio/NomeApp/NomeApp-1.apk, NomeApp-2.apk, ...
      const pastaApp = nomePastaAppStudio(b.nomeApp, b.pacote);
      const destino = await ApkBuilder.copiarSequencial(
        String(b.apk).replace(/^file:\/\//, ''),
        `${PASTA_PUBLICA_TEXTO}/${pastaApp}`,
        pastaApp
      );
      return { ok: true, destino };
    } catch (e) {
      return { ok: false, motivo: String(e && e.message ? e.message : e) };
    }
  }
  try {
    try {
      await FileSystem.makeDirectoryAsync(PASTA_PUBLICA_STUDIO, { intermediates: true });
    } catch (e) { /* já existe, ou sem permissão — o copyAsync abaixo diz qual */ }
    const nome = nomeArquivoPublicoStudio(b);
    let destino = PASTA_PUBLICA_STUDIO + nome;
    for (let n = 2; n < 60; n += 1) {
      let existe = false;
      try {
        const i = await FileSystem.getInfoAsync(destino);
        existe = !!(i && i.exists);
      } catch (e) { existe = false; }
      if (!existe) break;
      destino = PASTA_PUBLICA_STUDIO + nome.replace(/\.apk$/i, `-${n}.apk`);
    }
    const origem = /^[a-z]+:\/\//i.test(String(b.apk)) ? b.apk : `file://${b.apk}`;
    try {
      await FileSystem.copyAsync({ from: origem, to: destino });
    } catch (erroCopia) {
      // Plano B: em alguns aparelhos o copyAsync recusa a pasta pública mesmo
      // com a permissão liberada (a gravação normal funciona). Então lê o APK
      // e grava no destino direto.
      const dados = await FileSystem.readAsStringAsync(origem, { encoding: FileSystem.EncodingType.Base64 });
      await FileSystem.writeAsStringAsync(destino, dados, { encoding: FileSystem.EncodingType.Base64 });
    }
    return { ok: true, destino };
  } catch (e) {
    return { ok: false, motivo: String(e && e.message ? e.message : e) };
  }
}

// Copia todos os builds que ainda não estão na pasta pública. Para na
// primeira falha de destino (provável falta de permissão); pula os que
// perderam o arquivo de origem.
async function copiarPendentesPastaPublicaStudio(lista) {
  let atual = lista;
  let copiados = 0;
  let falhou = false;
  let motivo = '';
  for (const b of lista) {
    if (b.apkPublico) continue;
    try {
      const i = await FileSystem.getInfoAsync(b.apk);
      if (!i || !i.exists) continue;
    } catch (e) { continue; }
    const r = await copiarParaPastaPublicaStudio(b);
    if (!r.ok) { falhou = true; motivo = r.motivo; break; }
    copiados += 1;
    atual = atual.map((x) => (x.id === b.id ? { ...x, apkPublico: r.destino } : x));
  }
  return { lista: atual, copiados, falhou, motivo };
}

// ─────────────────────────────────────────────────────────
// Pasta de cada app: cindra-studio/NomeApp/
//   NomeApp-1.apk, NomeApp-2.apk ...
//   arquivos/  → espelho do projeto. Mexer lá (alterar, apagar, renomear,
//                adicionar) altera o app na próxima vez que o Studio abrir
//                / voltar pra tela / compilar.
// ─────────────────────────────────────────────────────────
function nomePastaAppStudio(nomeApp, pacote) {
  let x = String(nomeApp || '');
  try { if (x.normalize) x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* segue sem tirar acento */ }
  x = x.replace(/[^A-Za-z0-9._-]+/g, '').replace(/^[._-]+/, '');
  if (!x) x = String(pacote || '').split('.').pop().replace(/[^A-Za-z0-9._-]+/g, '');
  return x || 'app';
}

const PASTA_SYNC_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_sync/`;

// { ultimaSync, pasta, arquivos } da última sincronização do projeto.
async function lerSyncStudio(pacote) {
  try {
    const t = await FileSystem.readAsStringAsync(`${PASTA_SYNC_STUDIO}${pacote}.json`, { encoding: FileSystem.EncodingType.UTF8 });
    const o = JSON.parse(t) || {};
    return { ultimaSync: Number(o.ultimaSync) || 0, pasta: o.pasta || '', arquivos: Array.isArray(o.arquivos) ? o.arquivos : [] };
  } catch (e) {
    return { ultimaSync: 0, pasta: '', arquivos: [] };
  }
}

async function gravarSyncStudio(pacote, dados) {
  try {
    await FileSystem.makeDirectoryAsync(PASTA_SYNC_STUDIO, { intermediates: true }).catch(() => {});
    await FileSystem.writeAsStringAsync(`${PASTA_SYNC_STUDIO}${pacote}.json`, JSON.stringify(dados), { encoding: FileSystem.EncodingType.UTF8 });
  } catch (e) { /* sem sync desta vez */ }
}

// Grava o projeto em cindra-studio/NomeApp/arquivos. Não sobrescreve o que
// foi editado por fora e ainda não entrou no app.
async function espelharProjetoNaPastaStudio(proj, nomeApp) {
  if (!ApkBuilder.temEspelhoNativo || !proj || !proj.pacote) return false;
  if (!(await testarAcessoPastaPublicaStudio())) return false;
  const pasta = nomePastaAppStudio(nomeApp, proj.pacote);
  const raiz = `${PASTA_PUBLICA_TEXTO}/${pasta}/arquivos`;
  const sync = await lerSyncStudio(proj.pacote);
  const ultima = sync.pasta === pasta ? sync.ultimaSync : 0;
  const conteudos = proj.conteudos || {};
  const binarios = Object.keys(proj.binarios || {});
  const r = await ApkBuilder.espelharProjeto(raiz, conteudos, pastaBinariosStudio(proj.pacote), binarios, ultima);
  await gravarSyncStudio(proj.pacote, {
    ultimaSync: r && r.agora ? r.agora : Date.now(),
    pasta,
    arquivos: Object.keys(conteudos).concat(binarios),
  });
  return true;
}

// Compara a pasta "arquivos" com o projeto e devolve o que mudou por fora:
// { textos: {caminho: texto}, binarios: {caminho: {tamanho}}, removidos: [caminho] }
// (ou null se não tem nada novo / não dá pra checar).
async function lerAlteracoesDaPastaStudio(proj, nomeApp) {
  if (!ApkBuilder.temEspelhoNativo || !proj || !proj.pacote) return null;
  const pasta = nomePastaAppStudio(nomeApp, proj.pacote);
  const sync = await lerSyncStudio(proj.pacote);
  if (!sync.ultimaSync || sync.pasta !== pasta) return null;
  if (!(await testarAcessoPastaPublicaStudio())) return null;
  const raiz = `${PASTA_PUBLICA_TEXTO}/${pasta}/arquivos`;
  const lista = await ApkBuilder.listarPasta(raiz);
  if (!Array.isArray(lista)) return null;

  const limite = sync.ultimaSync + 1000;
  const noDisco = new Map();
  for (const it of lista) {
    const rel = String(it.caminho).replace(/\\/g, '/');
    if (rel.split('/').pop().startsWith('.')) continue;
    noDisco.set(rel, it);
  }
  const conteudos = proj.conteudos || {};
  const binarios = proj.binarios || {};
  const delta = { textos: {}, binarios: {}, removidos: [] };

  // 1) alterados / novos (só o que foi mexido depois da última sincronia)
  const lerComoTexto = [];
  const novosSemTipo = [];
  for (const [rel, it] of noDisco) {
    if (!(it.modificado > limite)) continue;
    const nome = rel.split('/').pop();
    if (binarios[rel]) {
      delta.binarios[rel] = { tamanho: it.tamanho || 0 };
    } else if (conteudos[rel] !== undefined) {
      lerComoTexto.push(rel);
    } else if (ehExtensaoTexto(nome)) {
      lerComoTexto.push(rel);
    } else if (ehExtensaoBinaria(nome) || (it.tamanho || 0) > 2000000) {
      delta.binarios[rel] = { tamanho: it.tamanho || 0 };
    } else {
      novosSemTipo.push(rel);
    }
  }
  const nomesParaLer = lerComoTexto.concat(novosSemTipo);
  const lidos = nomesParaLer.length ? await ApkBuilder.lerTextos(raiz, nomesParaLer) : {};
  for (const rel of lerComoTexto) {
    if (typeof lidos[rel] === 'string' && lidos[rel] !== conteudos[rel]) delta.textos[rel] = lidos[rel];
  }
  for (const rel of novosSemTipo) {
    const t = typeof lidos[rel] === 'string' ? lidos[rel] : null;
    if (t === null) continue;
    const amostra = t.slice(0, 4096);
    let estranhos = 0;
    for (let i = 0; i < amostra.length; i += 1) {
      const c = amostra.charCodeAt(i);
      if (c === 0) { estranhos = amostra.length; break; }
      if (c === 0xfffd) estranhos += 1;
    }
    if (amostra.length && estranhos / amostra.length > 0.01) delta.binarios[rel] = { tamanho: (noDisco.get(rel).tamanho) || 0 };
    else delta.textos[rel] = t;
  }

  // binários alterados/novos: copia pro lugar onde o Studio guarda
  for (const rel of Object.keys(delta.binarios)) {
    try {
      await ApkBuilder.copiarSobrescrevendo(`${raiz}/${rel}`, pastaBinariosStudio(proj.pacote) + rel);
    } catch (e) {
      delete delta.binarios[rel];
    }
  }

  // 2) apagados / renomeados por fora: só os que a gente tinha espelhado
  if (lista.length > 0) {
    for (const rel of sync.arquivos) {
      if (noDisco.has(rel)) continue;
      if (conteudos[rel] === undefined && !binarios[rel]) continue;
      delta.removidos.push(rel);
      if (binarios[rel]) FileSystem.deleteAsync(pastaBinariosStudio(proj.pacote) + rel, { idempotent: true }).catch(() => {});
    }
  }

  const mudou = Object.keys(delta.textos).length + Object.keys(delta.binarios).length + delta.removidos.length > 0;
  return mudou ? delta : null;
}

function aplicarAlteracoesDaPastaStudio(proj, d) {
  if (!proj || !d) return proj;
  const conteudos = { ...proj.conteudos };
  const binarios = { ...(proj.binarios || {}) };
  let arvore = proj.arvore;
  for (const rel of Object.keys(d.textos)) {
    delete binarios[rel];
    conteudos[rel] = d.textos[rel];
    arvore = garantirArquivoNaArvore(arvore, rel);
  }
  for (const rel of Object.keys(d.binarios)) {
    delete conteudos[rel];
    binarios[rel] = d.binarios[rel];
    arvore = garantirArquivoNaArvore(arvore, rel);
  }
  for (const rel of d.removidos) {
    delete conteudos[rel];
    delete binarios[rel];
    arvore = removerNoDaArvore(arvore, rel);
  }
  return { ...proj, conteudos, binarios, arvore };
}

// Agrupa os builds por app (pacote). Grupos e builds ficam do mais novo pro
// mais antigo; o "ultimo" dá nome e ícone do cabeçalho do grupo.
function agruparBuildsStudio(builds) {
  const mapa = {};
  (builds || []).forEach((b) => {
    if (!mapa[b.pacote]) mapa[b.pacote] = [];
    mapa[b.pacote].push(b);
  });
  return Object.keys(mapa)
    .map((pacote) => {
      const itens = mapa[pacote].slice().sort((a, b) => b.criadoEm - a.criadoEm);
      return { pacote, itens, ultimo: itens[0], icone: itens.find((x) => x.fotoIcone) || itens[0] };
    })
    .sort((a, b) => b.ultimo.criadoEm - a.ultimo.criadoEm);
}

// "25/10/2026 às 14:32" — manual, sem depender de Intl do Hermes.
function formatarDataBuildStudio(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} às ${dois(d.getHours())}:${dois(d.getMinutes())}`;
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
  instalarBtnText: { color: '#ffffff', fontSize: 14.5, fontWeight: '700' },
  // ---- Painel de compilação (redesenho) ----
  compileHeaderWrap: {
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    overflow: 'hidden',
  },
  compileHeaderGlow: {
    position: 'absolute',
    top: -70,
    alignSelf: 'center',
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.16,
  },
  compileIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginBottom: 10,
  },
  compileTitulo: { color: COLORS.ink, fontSize: 16.5, fontWeight: '800', letterSpacing: 0.2 },
  compileSubtitulo: { color: COLORS.dim, fontSize: 12.5, marginTop: 3, textAlign: 'center' },
  compileCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  progressTrackWrap: { paddingHorizontal: 18, marginTop: 4, marginBottom: 4 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: COLORS.ember,
  },
  stepperWrap: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    gap: 4,
  },
  stepperItem: { flex: 1, alignItems: 'center', gap: 6 },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  stepDotFeita: { borderColor: 'rgba(139,214,255,0.0)', backgroundColor: COLORS.ember },
  stepDotAtiva: { borderColor: COLORS.ember, backgroundColor: 'rgba(180,60,255,0.14)' },
  stepDotErro: { borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.14)' },
  stepLinha: {
    position: 'absolute',
    top: 15,
    left: '50%',
    width: '100%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    zIndex: -1,
  },
  stepLinhaFeita: { backgroundColor: COLORS.ember },
  stepLabel: { color: COLORS.dim, fontSize: 9, fontWeight: '600', textAlign: 'center' },
  stepLabelAtiva: { color: COLORS.ink },
  logCard: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
  },
  logCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  logCardHeaderText: { color: COLORS.dim, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  logLinhaWrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 5 },
  logDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.dim, marginTop: 6.5 },
  logItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  logItemIcone: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  logItemTexto: { flex: 1, color: COLORS.dim, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  successCard: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,212,80,0.35)',
    backgroundColor: 'rgba(139,212,80,0.08)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  successCardTextos: { flex: 1 },
  successCardTitulo: { color: COLORS.ink, fontSize: 14, fontWeight: '700', marginBottom: 2 },
  successCardCaminho: { color: COLORS.dim, fontSize: 11 },
  // ---- Workspace: barra superior ----
  workspaceTopWrap: {
    backgroundColor: '#0d0d0f',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  workspaceGlow: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.emberGlow,
    opacity: 0.1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 4,
  },
  topBarTitle: { flex: 1, color: '#e8efe9', fontSize: 15, fontWeight: '700', marginLeft: 6 },
  topBarIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  topBarActionsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 13,
    padding: 3,
    gap: 2,
  },
  topBarDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.10)', marginHorizontal: 2 },
  // ---- Abas de arquivo em formato de card (substituem a antiga barra
  // de abas + breadcrumb, que juntas tomavam duas linhas inteiras) ----
  tabsBar: {
    maxHeight: 52,
  },
  tabsBarConteudo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'transparent',
    maxWidth: 168,
  },
  tabAtiva: {
    backgroundColor: 'rgba(180,60,255,0.14)',
    borderColor: 'rgba(180,60,255,0.45)',
  },
  tabText: { color: COLORS.dim, fontSize: 12.5, maxWidth: 96 },
  tabTextAtiva: { color: COLORS.ink, fontWeight: '700' },
  // Caminho do arquivo ativo: faixa fina FORA do editor (no fluxo do layout),
  // pra nunca ficar flutuando por cima do código.
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#0d0d0f',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  pathBarText: { flex: 1, color: COLORS.dim, fontSize: 11 },
  // ---- Ferramentas do editor: buscar/substituir, ir para linha, símbolos ----
  pathBtn: { width: 28, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pathBtnAtivo: { backgroundColor: 'rgba(180,60,255,0.18)' },
  edBarra: {
    backgroundColor: '#111113',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 7,
  },
  edLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  edInput: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 0,
    color: COLORS.ink,
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  edContador: { color: COLORS.dim, fontSize: 12, minWidth: 40, textAlign: 'center' },
  edIconBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  edChip: {
    paddingHorizontal: 11,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  edChipAtivo: { backgroundColor: 'rgba(180,60,255,0.16)', borderColor: 'rgba(180,60,255,0.5)' },
  edChipTexto: { color: COLORS.dim, fontSize: 12.5, fontWeight: '700' },
  edChipTextoAtivo: { color: COLORS.ink },
  edBotaoAcao: { paddingHorizontal: 12, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.ember },
  edBotaoAcaoTexto: { color: '#ffffff', fontSize: 12.5, fontWeight: '800' },
  edBotaoPerigo: { backgroundColor: '#ff6b6b' },
  edResultados: { maxHeight: 190, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)' },
  edResResumo: { color: COLORS.dim, fontSize: 11.5, paddingHorizontal: 10, paddingVertical: 7 },
  edResArquivo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 3 },
  edResArquivoTexto: { flex: 1, color: COLORS.ink, fontSize: 11.5, fontWeight: '700' },
  edResItem: { flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  edResLinha: { color: COLORS.ember, fontSize: 11.5, fontWeight: '700', minWidth: 30, textAlign: 'right' },
  edResTrecho: { flex: 1, color: COLORS.dim, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  edErroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,107,107,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,107,107,0.35)',
  },
  edErroTexto: { color: '#ffb4ab', fontSize: 12, lineHeight: 16 },
  symBarra: { backgroundColor: '#141416', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  symLinha: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 5, gap: 5 },
  symTecla: {
    minWidth: 36,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  symTeclaDestaque: { backgroundColor: 'rgba(180,60,255,0.16)', borderColor: 'rgba(180,60,255,0.5)' },
  symTeclaTexto: { color: COLORS.ink, fontSize: 16, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  zoomBadge: {
    position: 'absolute',
    top: 10,
    right: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  zoomBadgeTexto: { color: COLORS.ink, fontSize: 12.5, fontWeight: '800' },
  snipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  snipIcone: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(180,60,255,0.14)' },
  snipNome: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  snipDesc: { color: COLORS.dim, fontSize: 12, marginTop: 1 },
  snipGatilho: { color: COLORS.dim, fontSize: 11.5, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  editorRow: { flexDirection: 'row', minHeight: '100%' },
  lineNumbers: { paddingVertical: 14, paddingHorizontal: 8, backgroundColor: '#0a0a0c', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.05)' },
  lineNumberText: { color: 'rgba(255,255,255,0.28)', fontSize: 13, lineHeight: 20, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', textAlign: 'right' },
  codeInput: {
    // Texto do próprio TextInput fica "invisível" igualando a cor dele à cor
    // de fundo do editor (#0a0a0c) — NÃO usamos color:'transparent' aqui de
    // propósito. 'transparent' é tratado como caso especial pelo Android: ao
    // ativar a seleção nativa (bloco de seleção + menu Traduzir/Recortar/
    // Copiar), o sistema às vezes ignora a transparência e desenha o glifo
    // de verdade por baixo da camada colorida (codeHighlightOverlay),
    // causando aquele efeito de "letra duplicada/fantasma" durante o
    // select-to-copy. Com uma cor sólida igual ao fundo, mesmo esse
    // "vazamento" se funde com o fundo e fica invisível. O cursor
    // (cursorColor) e a seleção (selectionColor) continuam normais.
    color: '#0a0a0c',
    fontSize: CODIGO_FONTE,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    paddingVertical: 14,
    paddingHorizontal: 12,
    textAlignVertical: 'top',
    // Sem isso o Android reserva um respiro extra em cima/embaixo da fonte
    // que MUDA de tamanho conforme o glifo — é a causa clássica do overlay
    // de highlight ir "descolando" verticalmente linha a linha conforme
    // rola o arquivo. Com includeFontPadding:false a métrica fica idêntica
    // à do Text do overlay (que usa o mesmo valor), então as duas camadas
    // ficam sempre grudadas, igual um editor nativo (tipo o do MT Manager).
    includeFontPadding: false,
  },
  // Camada de cor por trás do TextInput: mesma fonte/tamanho/padding do
  // codeInput, cada linha posicionada de forma absoluta na altura exata
  // dela (mesma fórmula da coluna de números), pra ficar sempre alinhada
  // mesmo com o editor virtualizando só a janela visível.
  codeHighlightOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  codeHighlightLine: {
    position: 'absolute',
    left: 12,
    right: 0,
    color: '#d4d4d4',
    fontSize: CODIGO_FONTE,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    includeFontPadding: false,
  },
  emptyEditor: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  emptyEditorIcone: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,60,255,0.12)',
    marginBottom: 16,
  },
  emptyEditorTitulo: { color: COLORS.ink, fontSize: 15.5, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  emptyEditorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 13,
    backgroundColor: COLORS.ember,
  },
  emptyEditorBtnText: { color: '#ffffff', fontSize: 13.5, fontWeight: '700' },
  sidebarBackdrop: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sidebarPanel: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '86%', maxWidth: 380, backgroundColor: '#0d0d0f', borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', elevation: 24, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 6, height: 0 } },
  overlayRaiz: { zIndex: 50, elevation: 50 },
  sidebarGlow: {
    position: 'absolute',
    top: -70,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: COLORS.emberGlow,
    opacity: 0.09,
  },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 8 },
  sidebarHeaderIcone: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,60,255,0.14)',
    marginRight: 2,
  },
  sidebarHeaderBtn: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  sidebarTitle: { flex: 1, color: COLORS.ink, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  // Árvore de arquivos. Cada nível só soma ~19px de recuo (margem da linha-guia
  // + padding); antes cada nível somava a margem lateral da linha também,
  // por isso o conteúdo vazava pra fora do painel em pastas mais fundas.
  treeRow: { flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingVertical: 8, paddingRight: 10, borderRadius: 11, marginBottom: 2, borderWidth: 1, borderColor: 'transparent' },
  treeRowPasta: { paddingLeft: 6, backgroundColor: 'rgba(255,255,255,0.035)' },
  treeRowArquivo: { paddingLeft: 24 },
  treeRowArquivoAtiva: { backgroundColor: 'rgba(180,60,255,0.15)', borderColor: 'rgba(180,60,255,0.42)' },
  treeIndent: {
    marginLeft: 13,
    marginBottom: 2,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.09)',
    paddingLeft: 6,
  },
  treeText: { flex: 1, flexShrink: 1, color: 'rgba(255,255,255,0.86)', fontSize: 13.5 },
  treeTextPasta: { color: COLORS.ink, fontWeight: '600' },
  treeBadge: { marginLeft: 8, minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center' },
  treeBadgeText: { color: COLORS.dim, fontSize: 11, fontWeight: '600' },
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
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  colorDotAtiva: { borderColor: '#fff' },
  // Tela de configuração (novo app)
  cfgHero: { alignItems: 'center', marginTop: 18, marginBottom: 18, paddingVertical: 8 },
  cfgHeroGlow: { position: 'absolute', top: -10, width: 170, height: 170, borderRadius: 85, opacity: 0.16 },
  cfgIconeWrap: { width: 116, height: 116, marginBottom: 14 },
  cfgIconeBase: { width: 116, height: 116, borderRadius: 30, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cfgIconeFoto: { width: 116, height: 116, borderRadius: 30, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: '#140d28' },
  cfgIconeBadge: { position: 'absolute', right: -6, bottom: -6, width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.ember, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#000000' },
  cfgCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: 16, marginBottom: 14 },
  cfgCampo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.28)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 14, paddingHorizontal: 14 },
  cfgCampoFoco: { borderColor: 'rgba(180,60,255,0.65)', backgroundColor: 'rgba(180,60,255,0.06)' },
  cfgCampoInput: { flex: 1, color: COLORS.ink, fontSize: 15, paddingVertical: 13 },
  cfgBtnRow: { flexDirection: 'row', gap: 10 },
  cfgBtnPrimario: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: 'rgba(180,60,255,0.13)', borderWidth: 1, borderColor: 'rgba(180,60,255,0.4)' },
  cfgBtnPrimarioTexto: { color: '#d9a2ff', fontSize: 14, fontWeight: '700' },
  cfgBtnSecundario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  cfgBtnSecundarioTexto: { color: COLORS.ink, fontSize: 13.5, fontWeight: '600' },
  cfgFooter: { paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', backgroundColor: COLORS.sheet },
  previewName: { color: COLORS.ink, fontSize: 18, fontWeight: '800' },
  previewPkg: { color: COLORS.dim, fontSize: 12.5, marginTop: 3 },
  criarBtn: {
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 9,
    backgroundColor: COLORS.ember,
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: COLORS.ember,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  criarBtnText: { color: '#ffffff', fontSize: 15.5, fontWeight: '800' },
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
    backgroundColor: 'rgba(180,60,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  homeVazioTitulo: { color: COLORS.ink, fontSize: 14, fontWeight: '700', marginBottom: 6 },
  homeVazioTexto: { color: COLORS.dim, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  // Cabeçalho
  homeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 6,
    minHeight: 68,
  },
  homeOverline: { color: COLORS.ember, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.6, marginBottom: 4 },
  homeTitulo: { color: COLORS.ink, fontSize: 24.5, fontWeight: '800', letterSpacing: -0.5, marginTop: 4 },
  homeIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
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
  buscaInput: { flex: 1, color: COLORS.ink, fontSize: 13, paddingVertical: 0 },
  // Card "Retomar"
  heroCard: { backgroundColor: '#3a1d7a', borderRadius: 28, padding: 18, marginTop: 14, overflow: 'hidden' },
  heroMarcaDagua: { position: 'absolute', right: -26, top: -22, opacity: 0.07 },
  heroTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heroSelo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(233,213,255,0.14)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroSeloTexto: { color: '#e9d5ff', fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  heroTempo: { color: 'rgba(233,213,255,0.7)', fontSize: 11 },
  heroCorpo: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  heroNome: { color: '#ffffff', fontSize: 17.5, fontWeight: '800' },
  heroPacote: { color: 'rgba(233,213,255,0.7)', fontSize: 11.5, marginTop: 2 },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#e9d5ff',
  },
  heroBtnText: { color: '#3a1d7a', fontSize: 13, fontWeight: '800' },
  // Blocos de filtro (Apps / Favoritos / Esta semana)
  tilesLinha: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tile: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tileAtivo: { backgroundColor: 'rgba(180,60,255,0.16)', borderColor: 'rgba(180,60,255,0.45)' },
  tileTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileNumero: { color: COLORS.ink, fontSize: 23, fontWeight: '800' },
  tileRotulo: { color: COLORS.dim, fontSize: 11, fontWeight: '600', marginTop: 2 },
  // Título da seção + ordenar + modo lista/grade
  secaoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 12 },
  secaoTitulo: { color: COLORS.ink, fontSize: 16, fontWeight: '800' },
  secaoContagem: { color: COLORS.dim, fontSize: 12.5, fontWeight: '600' },
  ordemPilula: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  ordemTexto: { color: COLORS.ink, fontSize: 11, fontWeight: '600' },
  modoBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Cards de app (lista e grade)
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
  projNome: { color: COLORS.ink, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  projPacote: { color: COLORS.dim, fontSize: 10.5, marginTop: 3 },
  projTempoLinha: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  projTempo: { color: COLORS.dim, fontSize: 10.5 },
  projMais: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  gradeWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gradeCard: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 22, padding: 14 },
  gradeTopo: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  gradeTempo: { color: COLORS.dim, fontSize: 10.5, marginTop: 8 },
  // Aviso "versão anterior"
  avisoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(180,60,255,0.10)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  avisoTexto: { flex: 1, color: COLORS.ink, fontSize: 11.5, lineHeight: 16 },
  avisoBtnText: { color: '#d9a2ff', fontSize: 11.5, fontWeight: '800' },
  // Card de apoio
  apoioCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,122,217,0.45)',
    borderRadius: 22,
    padding: 14,
    marginTop: 8,
  },
  apoioTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,122,217,0.14)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 10,
  },
  apoioTagTexto: { color: COLORS.gold, fontSize: 10.5, fontWeight: '700' },
  apoioLinha: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  apoioIcone: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,122,217,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  apoioTitulo: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  apoioSub: { color: COLORS.dim, fontSize: 11.5, marginTop: 2 },
  // Estado vazio
  vazioBtn: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: COLORS.ember,
  },
  vazioBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  // Barra de baixo
  navHome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: '#1a1230',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  navAba: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  navAbaAtiva: { backgroundColor: 'rgba(180,60,255,0.20)', borderColor: 'rgba(180,60,255,0.45)' },
  navAbaTexto: { color: COLORS.dim, fontSize: 10.5, fontWeight: '600' },
  navAbaTextoAtivo: { color: COLORS.ink, fontWeight: '700' },
  navBotaoCriar: {
    overflow: 'hidden',
    flex: 1,
    height: 50,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: COLORS.ember,
    shadowColor: COLORS.ember,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  navBotaoCriarTexto: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  // Folha que sobe do rodapé
  folha: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#18102e',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  folhaAlca: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', marginBottom: 16 },
  folhaTopo: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  folhaTitulo: { color: COLORS.ink, fontSize: 17, fontWeight: '800' },
  folhaSub: { color: COLORS.dim, fontSize: 12.5, marginTop: 2 },
  folhaLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 8,
  },
  folhaLinhaTexto: { flex: 1, color: COLORS.ink, fontSize: 15, fontWeight: '600' },
  permGrupo: { color: COLORS.dim, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 14, marginBottom: 8, marginLeft: 4 },
  permLinha: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 12, paddingRight: 8,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 8,
  },
  permNome: { color: COLORS.ink, fontSize: 15, fontWeight: '600' },
  nodoTopo: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nodoIcone: {
    width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  nodoCaminho: { color: COLORS.dim, fontSize: 11.5, marginTop: 10, marginBottom: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  nodoOpcao: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 8,
  },
  nodoOpcaoIcone: {
    width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  nodoOpcaoDesc: { color: COLORS.dim, fontSize: 12, lineHeight: 16, marginTop: 2 },
  nodoDica: { color: COLORS.dim, fontSize: 12, marginTop: 8, marginLeft: 4 },
  nodoChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  nodoChip: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  nodoChipTexto: { color: COLORS.ink, fontSize: 13, fontWeight: '600' },
  cfgAbas: {
    flexDirection: 'row', gap: 6, marginTop: 14, marginBottom: 10, padding: 4,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cfgAba: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12 },
  cfgAbaSel: { backgroundColor: COLORS.ember },
  cfgAbaTexto: { color: COLORS.dim, fontSize: 13, fontWeight: '700' },
  cfgAbaTextoSel: { color: '#ffffff' },
  spLiga: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  spLigaIcone: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(180,60,255,0.12)' },
  spCelulares: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 14 },
  spCelular: {
    borderRadius: 26, borderWidth: 3, borderColor: '#34343a', overflow: 'hidden', backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },
  spEntalhe: { position: 'absolute', top: 7, width: 30, height: 8, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.75)' },
  spCentro: { alignItems: 'center', justifyContent: 'center' },
  spMarcaPrev: { position: 'absolute', bottom: 20, left: 8, right: 8, textAlign: 'center', fontSize: 12.5, fontWeight: '600', letterSpacing: 0.3 },
  spLegendaTitulo: { color: COLORS.ink, fontSize: 13.5, fontWeight: '800', marginTop: 8 },
  spLegendaSub: { color: COLORS.dim, fontSize: 11.5, marginTop: 1 },
  spLegenda: { marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', gap: 9 },
  spLegendaLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  spLegendaTexto: { flex: 1, color: COLORS.dim, fontSize: 12.5, lineHeight: 17 },
  spCard: {
    marginTop: 10, padding: 12, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  spCardTopo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  spCardTitulo: { color: COLORS.ink, fontSize: 15.5, fontWeight: '800' },
  spMiniatura: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  spBotoes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  spBtnPrim: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: 14,
    backgroundColor: COLORS.ember,
  },
  spBtnPrimTexto: { color: '#ffffff', fontSize: 14.5, fontWeight: '800' },
  spBtnSec: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)' },
  spContador: { color: COLORS.dim, fontSize: 11.5, fontWeight: '700' },
  spCores: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 },
  spCor: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  spCorSel: { borderWidth: 2.5, borderColor: COLORS.ember },
  spAviso: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12, marginBottom: 8, paddingHorizontal: 4 },
  spAvisoTexto: { flex: 1, color: COLORS.dim, fontSize: 11.5, lineHeight: 16 },
  nodoBtnSec: { backgroundColor: 'rgba(255,255,255,0.07)' },
  nodoBtnSecTexto: { color: COLORS.ink, fontSize: 15, fontWeight: '700' },
  nodoBtnPrim: { backgroundColor: COLORS.ember, flexDirection: 'row', gap: 6 },
  nodoBtnPrimTexto: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  folhaConfirma: { backgroundColor: 'rgba(255,107,107,0.10)', borderRadius: 16, padding: 14 },
  folhaConfirmaTexto: { color: '#e0c3ff', fontSize: 13.5, lineHeight: 19, marginBottom: 14 },
  folhaConfirmaBotoes: { flexDirection: 'row', gap: 10 },
  folhaBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  folhaBtnPerigo: { backgroundColor: '#ff6b6b' },
  folhaBtnTexto: { color: COLORS.ink, fontSize: 14.5, fontWeight: '700' },
});

// Nó recursivo do explorador de arquivos (pastas expansíveis + arquivos
// clicáveis, igual à estrutura "app > src > main > java > ... > MainActivity.java"
// que aparece no CodeAssist).
// A indentação de cada nível vem do wrapper "treeIndent" (com sua linha-guia
// à esquerda), então o componente não precisa mais calcular profundidade — o
// aninhamento das Views já cuida disso, e cada nível ganha sua própria guia.
function NoArvoreArquivo({ no, pastasAbertas, alternarPasta, arquivoAtivo, onAbrirArquivo, aoSegurar }) {
  if (no.tipo === 'pasta') {
    const aberta = !!pastasAbertas[no.caminho];
    return (
      <View>
        <TouchableOpacity
          onPress={() => alternarPasta(no.caminho)}
          onLongPress={() => aoSegurar && aoSegurar(no)}
          delayLongPress={350}
          style={[studioStyles.treeRow, studioStyles.treeRowPasta]}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name={aberta ? 'chevron-down' : 'chevron-right'} size={14} color={COLORS.dim} style={{ marginRight: 2 }} />
          <MaterialCommunityIcons name={aberta ? 'folder-open' : 'folder'} size={16} color={COLORS.ember} style={{ marginRight: 8, marginLeft: 2 }} />
          <Text style={[studioStyles.treeText, studioStyles.treeTextPasta]} numberOfLines={1} ellipsizeMode="middle" maxFontSizeMultiplier={1.15}>{no.nome}</Text>
          {no.filhos.length > 0 && (
            <View style={studioStyles.treeBadge}>
              <Text style={studioStyles.treeBadgeText} maxFontSizeMultiplier={1.1}>{no.filhos.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        {aberta && (
          <View style={studioStyles.treeIndent}>
            {no.filhos.map((filho) => (
              <NoArvoreArquivo
                key={filho.caminho}
                no={filho}
                pastasAbertas={pastasAbertas}
                alternarPasta={alternarPasta}
                arquivoAtivo={arquivoAtivo}
                onAbrirArquivo={onAbrirArquivo}
                aoSegurar={aoSegurar}
              />
            ))}
          </View>
        )}
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
      style={[studioStyles.treeRow, studioStyles.treeRowArquivo, ativo && studioStyles.treeRowArquivoAtiva]}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons name={icon} size={16} color={color} style={{ marginRight: 8 }} />
      <Text style={[studioStyles.treeText, ativo && { color: COLORS.ink, fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="middle" maxFontSizeMultiplier={1.15}>{no.nome}</Text>
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

// Estilos da aba "Gerados" (apps compilados + histórico de APKs).
const geradosStyles = StyleSheet.create({
  lista: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 20 },
  resumo: { color: COLORS.dim, fontSize: 10.5, marginTop: 2 },
  grupo: {
    backgroundColor: COLORS.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    marginBottom: 8,
    overflow: 'hidden',
  },
  grupoTopo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9 },
  grupoNome: { color: COLORS.ink, fontSize: 13, fontWeight: '700', flexShrink: 1 },
  grupoPacote: { color: COLORS.dim, fontSize: 10.5, marginTop: 1 },
  grupoMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  grupoBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 7,
    backgroundColor: 'rgba(180,60,255,0.16)',
  },
  grupoBadgeTexto: { color: '#d9a2ff', fontSize: 10.5, fontWeight: '800' },
  grupoData: { color: COLORS.dim, fontSize: 10.5 },
  seta: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildsWrap: { borderTopWidth: 1, borderTopColor: COLORS.lineSoft, paddingHorizontal: 10, paddingVertical: 2 },
  buildLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lineSoft,
  },
  buildTitulo: { color: COLORS.ink, fontSize: 11.5, fontWeight: '700' },
  buildData: { color: COLORS.dim, fontSize: 10.5, marginTop: 2 },
  buildTipo: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
  buildAcao: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  vazio: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  vazioIcone: {
    width: 76,
    height: 76,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,60,255,0.12)',
    marginBottom: 14,
  },
  apagarGrupo: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  apagarGrupoTexto: { color: COLORS.error, fontSize: 10.5, fontWeight: '700' },
  barraSelecao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    backgroundColor: COLORS.sheet,
  },
  barraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  barraBtnTexto: { color: COLORS.ink, fontSize: 11.5, fontWeight: '700' },
  barraApagar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.ember,
  },
  barraApagarTexto: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  // aba Publicar
  pubInfo: { color: COLORS.dim, fontSize: 10.5, marginTop: 3 },
  pubLinkLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  pubLink: { flex: 1, color: '#d9a2ff', fontSize: 12.5, fontWeight: '700', textDecorationLine: 'underline' },
  pubBtn: {
    minWidth: 82,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: COLORS.ember,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  pubBtnTexto: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  pubBtnInativo: { backgroundColor: 'rgba(255,255,255,0.09)' },
  pubBtnApagar: { backgroundColor: 'rgba(255,107,107,0.14)' },
  pubBtnApagarTexto: { color: '#ff8a80', fontSize: 12, fontWeight: '800' },
  pubBtnIcone: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// Barra de baixo da tela inicial: abas "Meus apps", "Gerados", "Publicar" e "Aprender" + botão "Criar".
const ABAS_HOME_STUDIO = [
  { id: 'apps', rotulo: 'Meus apps', icone: 'view-dashboard-outline', iconeAtivo: 'view-dashboard' },
  { id: 'gerados', rotulo: 'Gerados', icone: 'package-variant-closed', iconeAtivo: 'package-variant' },
  { id: 'publicar', rotulo: 'Publicar', icone: 'rocket-launch-outline', iconeAtivo: 'rocket-launch' },
  { id: 'aprender', rotulo: 'Aprender', icone: 'school-outline', iconeAtivo: 'school' },
  { id: 'criar', rotulo: 'Criar', especial: true },
];

const ROTULOS_ORDEM_STUDIO = {
  recentes: 'Mais recentes',
  antigos: 'Mais antigos',
  nome: 'Nome (A–Z)',
  nomeDesc: 'Nome (Z–A)',
};
const ICONES_ORDEM_STUDIO = {
  recentes: 'clock-outline',
  antigos: 'history',
  nome: 'sort-alphabetical-ascending',
  nomeDesc: 'sort-alphabetical-descending',
};

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

// ─────────────────────────────────────────────────────────
// NUVEM CINDRA — login opcional + backup dos projetos no servidor.
// O login serve SÓ pra salvar projetos. Sem conta o app funciona igual.
// Servidor: cada usuário tem uma pasta, e dentro dela uma pasta por projeto.
// ─────────────────────────────────────────────────────────
const NUVEM_URL = 'https://cindra-studio.shop';
// Quantos apps cada conta pode ter com link de download (o servidor também confere: MAX_PUBLICADOS_POR_USUARIO).
const LIMITE_PUBLICADOS_STUDIO = 5;
const URL_TERMOS_STUDIO = `${NUVEM_URL}/termos-de-uso`;
const URL_PRIVACIDADE_STUDIO = `${NUVEM_URL}/privacidade`;

// Abre um link num navegador por cima do app, sem sair dele (volta no X ou no botão voltar).
// Sem o expo-web-browser instalado, abre no navegador normal do aparelho.
async function abrirLinkNoApp(url) {
  try {
    if (WebBrowser && WebBrowser.openBrowserAsync) {
      await WebBrowser.openBrowserAsync(url, {
        toolbarColor: '#09050f',
        controlsColor: '#ffffff',
        showTitle: true,
        enableBarCollapsing: true,
        createTask: false, // fica dentro do app em vez de abrir outra janela do Chrome
      });
      return;
    }
    await Linking.openURL(url);
  } catch (e) {
    exibirAviso('Não foi possível abrir', 'Tente de novo em instantes.', 'erro');
  }
}
const ARQUIVO_NUVEM_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_nuvem.json`;
const LIMITE_BINARIO_NUVEM = 15 * 1024 * 1024;

function nuvemPadrao() {
  // pendentes: { pacote: quando mudou } · excluir: { pacote: true }
  // versoes: { pacote: última versão (do servidor) que este aparelho já tem }
  // semCota: { pacote: { t, em, avisado } } · projetos que a nuvem (100 MB) recusou; continuam no celular
  return { token: null, nome: null, pendentes: {}, excluir: {}, versoes: {}, semCota: {} };
}

async function lerNuvemStudio() {
  try {
    const info = await FileSystem.getInfoAsync(ARQUIVO_NUVEM_STUDIO);
    if (!info.exists) return nuvemPadrao();
    const texto = await FileSystem.readAsStringAsync(ARQUIVO_NUVEM_STUDIO, { encoding: FileSystem.EncodingType.UTF8 });
    const obj = JSON.parse(texto);
    return { ...nuvemPadrao(), ...(obj && typeof obj === 'object' ? obj : {}) };
  } catch (e) {
    return nuvemPadrao();
  }
}

async function gravarNuvemStudio(n) {
  await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}cindrastudio/`, { intermediates: true });
  await FileSystem.writeAsStringAsync(ARQUIVO_NUVEM_STUDIO, JSON.stringify(n), { encoding: FileSystem.EncodingType.UTF8 });
}

// Todas as mudanças no arquivo da nuvem passam por uma fila (sem corrida
// entre o autosave e a sincronização).
let filaNuvemStudio = Promise.resolve();
function alterarNuvemStudio(fn) {
  const p = filaNuvemStudio.then(async () => {
    const n = await lerNuvemStudio();
    const r = fn(n);
    await gravarNuvemStudio(n);
    return r;
  });
  filaNuvemStudio = p.catch(() => {});
  return p;
}

async function nuvemFetch(caminho, { metodo = 'GET', corpo, token, timeoutMs = 25000 } = {}) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const resp = await fetch(NUVEM_URL + caminho, {
      method: metodo,
      headers,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: ctrl ? ctrl.signal : undefined,
    });
    let dados = null;
    try { dados = await resp.json(); } catch (e) {}
    return { ok: resp.ok, status: resp.status, dados };
  } catch (e) {
    return { ok: false, status: 0, dados: null, semRede: true };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mensagemErroNuvem(r) {
  if (r.semRede) return 'Sem conexão com a internet. Tente de novo.';
  const e = r.dados && r.dados.erro;
  if (e === 'nome_invalido') return 'O nome deve ter de 3 a 20 caracteres: letras, números, ponto, traço ou _ (sem espaços).';
  if (e === 'senha_invalida') return 'A senha precisa ter de 6 a 100 caracteres.';
  if (e === 'nome_em_uso') return 'Esse nome já está em uso. Escolha outro.';
  if (e === 'login_incorreto') return 'Nome ou senha incorretos.';
  if (r.status === 429 || e === 'muitas_tentativas') return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  return 'Não foi possível conectar agora. Tente de novo em instantes.';
}

// ─── Link de download do APK: cindra-studio.shop/nome-do-app.app ───
// Só com conta. O APK vai pro servidor e o servidor serve uma página com o
// ícone e o botão de baixar.
function mensagemErroPublicar(r) {
  if (r.semRede) return 'Sem conexão com a internet. Tente de novo.';
  const e = r.dados && r.dados.erro;
  if (e === 'limite_publicados') return `Você chegou ao limite de ${LIMITE_PUBLICADOS_STUDIO} apps publicados. Apague algum link e tente de novo.`;
  if (e === 'muito_grande') return 'O APK é grande demais para enviar (limite de 95 MB).';
  if (e === 'apk_invalido') return 'O arquivo gerado não parece ser um APK válido. Compile de novo.';
  if (r.status === 429 || e === 'muitas_tentativas') return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.';
  return 'Não foi possível enviar agora. Tente de novo em instantes.';
}

async function publicarApkNuvem({ token, pacote, nome, versao, apkCaminho, iconeUri }) {
  // 1) reserva o link (e manda o ícone, se tiver)
  let icone;
  if (iconeUri) {
    try {
      const b64 = await FileSystem.readAsStringAsync(iconeUri, { encoding: FileSystem.EncodingType.Base64 });
      if (b64 && b64.length <= 2000000) icone = b64;
    } catch (e) { icone = undefined; }
  }
  const r = await nuvemFetch('/api/publicar', { metodo: 'POST', token, corpo: { pacote, nome, versao, icone }, timeoutMs: 40000 });
  if (!r.ok || !r.dados || !r.dados.slug) return { ok: false, status: r.status, mensagem: mensagemErroPublicar(r) };
  // 2) envia o APK direto (binário, sem base64)
  try {
    const uri = String(apkCaminho).indexOf('file://') === 0 ? apkCaminho : `file://${apkCaminho}`;
    const up = await FileSystem.uploadAsync(`${NUVEM_URL}/api/publicar/${r.dados.slug}/apk`, uri, {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.android.package-archive' },
    });
    if (up.status < 200 || up.status >= 300) {
      let dados = null;
      try { dados = JSON.parse(up.body); } catch (e) {}
      return { ok: false, status: up.status, mensagem: mensagemErroPublicar({ status: up.status, dados }) };
    }
  } catch (e) {
    return { ok: false, status: 0, mensagem: mensagemErroPublicar({ semRede: true }) };
  }
  return { ok: true, slug: r.dados.slug, url: r.dados.url };
}

// Lista os apps que a conta já publicou (aba "Publicar").
async function listarPublicadosNuvem(token) {
  const r = await nuvemFetch('/api/publicar', { token, timeoutMs: 15000 });
  if (r.ok && r.dados && Array.isArray(r.dados.lista)) return { ok: true, lista: r.dados.lista };
  return { ok: false, status: r.status, mensagem: mensagemErroPublicar(r) };
}

async function removerLinkApkNuvem(token, slug) {
  const r = await nuvemFetch(`/api/publicar/${slug}`, { metodo: 'DELETE', token });
  return r.ok;
}

// Botão único: o servidor entra se a conta existe, ou cria se não existe.
async function entrarNuvemStudio(nome, senha) {
  const r = await nuvemFetch('/api/conta/acessar', { metodo: 'POST', corpo: { nome, senha } });
  if (r.ok && r.dados && r.dados.token) return { ok: true, token: r.dados.token, nome: r.dados.nome || nome, criada: !!r.dados.criada };
  return { ok: false, mensagem: mensagemErroNuvem(r) };
}

async function sairNuvemStudio() {
  const n = await lerNuvemStudio();
  if (n.token) nuvemFetch('/api/conta/sair', { metodo: 'POST', token: n.token, timeoutMs: 8000 }).catch(() => {});
  await gravarNuvemStudio(nuvemPadrao());
}

function marcarPendenteNuvem(pacote) {
  return alterarNuvemStudio((n) => { if (n.token) n.pendentes[pacote] = Date.now(); }).catch(() => {});
}

function registrarExclusaoNuvem(pacote) {
  return alterarNuvemStudio((n) => {
    if (!n.token) return;
    n.excluir[pacote] = true;
    delete n.pendentes[pacote];
  }).catch(() => {});
}

// Monta o que vai pro servidor: textos separados do resto do estado + binários em base64.
async function montarPacoteNuvem(pacote) {
  const e = await lerEstadoStudio(pacote);
  if (!e) return null;
  const { conteudos, ...projetoSem } = e.projeto;
  const binarios64 = {};
  const pastaBin = pastaBinariosStudio(pacote);
  for (const caminho of Object.keys(e.projeto.binarios || {})) {
    try {
      const info = await FileSystem.getInfoAsync(pastaBin + caminho);
      if (!info.exists || (info.size || 0) > LIMITE_BINARIO_NUVEM) continue;
      binarios64[caminho] = await FileSystem.readAsStringAsync(pastaBin + caminho, { encoding: FileSystem.EncodingType.Base64 });
    } catch (err) {}
  }
  return { estado: { ...e, projeto: projetoSem }, conteudos, binarios64 };
}

// Recebe um projeto do servidor e cria tudo no celular (estado, lista e pasta).
async function instalarProjetoDaNuvem(pacote, dados) {
  const estadoRemoto = dados.estado || {};
  let proj = { ...(estadoRemoto.projeto || {}), conteudos: dados.conteudos || {} };
  if (!proj.arvore) throw new Error('projeto sem árvore');
  const binRecebidos = dados.binarios64 || {};
  const pastaBin = pastaBinariosStudio(pacote);
  await FileSystem.deleteAsync(pastaBin, { idempotent: true });
  const binarios = { ...(proj.binarios || {}) };
  for (const caminho of Object.keys(binarios)) {
    if (typeof binRecebidos[caminho] !== 'string') {
      // binário grande demais que não subiu: some do projeto neste aparelho
      delete binarios[caminho];
      proj = { ...proj, arvore: removerNoDaArvore(proj.arvore, caminho) };
      continue;
    }
    await FileSystem.makeDirectoryAsync(pastaBin + caminho.split('/').slice(0, -1).join('/'), { intermediates: true });
    await FileSystem.writeAsStringAsync(pastaBin + caminho, binRecebidos[caminho], { encoding: FileSystem.EncodingType.Base64 });
  }
  proj = { ...proj, binarios };

  let fotoIcone = null;
  if (binarios[ICONE_FOTO_CAMINHO]) {
    try {
      await FileSystem.makeDirectoryAsync(PASTA_ICONES_STUDIO, { intermediates: true });
      fotoIcone = `${PASTA_ICONES_STUDIO}${pacote}_${Date.now()}.png`;
      await FileSystem.copyAsync({ from: pastaBin + ICONE_FOTO_CAMINHO, to: fotoIcone });
    } catch (err) { fotoIcone = null; }
  }

  await gravarEstadoStudio({ ...estadoRemoto, nomePacote: pacote, fotoIcone, projeto: proj });

  const resumo = dados.resumo || {};
  const lista = await lerListaProjetosStudio();
  const anterior = lista.find((p) => p.pacote === pacote) || {};
  if (anterior.fotoIcone && anterior.fotoIcone !== fotoIcone) FileSystem.deleteAsync(anterior.fotoIcone, { idempotent: true }).catch(() => {});
  const item = {
    favorito: false,
    ...anterior,
    ...resumo,
    pacote,
    nomeApp: resumo.nomeApp || estadoRemoto.nomeApp || dados.nomeApp || anterior.nomeApp || 'Meu App',
    iconeEscolhido: resumo.iconeEscolhido || estadoRemoto.iconeEscolhido || anterior.iconeEscolhido,
    corIcone: resumo.corIcone || estadoRemoto.corIcone || anterior.corIcone,
    fotoIcone,
    atualizadoEm: dados.atualizadoEm || Date.now(),
  };
  await gravarListaProjetosStudio([item, ...lista.filter((p) => p.pacote !== pacote)]);
  // cria a pasta do projeto no celular
  await gravarProjetoStudio(proj).catch(() => {});
}

// Reconcilia celular × servidor. Nunca roda duas vezes ao mesmo tempo (quem chama garante).
async function sincronizarNuvemStudio({ abertoPacote } = {}) {
  let n = await lerNuvemStudio();
  if (!n.token) return { ok: false, semConta: true };
  const token = n.token;
  const res = { ok: true, mudouLista: false, enviados: 0, baixados: 0, rejeitados: [], semCota: [], pendencias: false, semRede: false };
  const aindaPendente = async () => {
    const x = await lerNuvemStudio();
    return Object.keys(x.pendentes || {}).length > 0 || Object.keys(x.excluir || {}).length > 0;
  };
  const falha = async (r) => ({ ...res, ok: false, semRede: !!r.semRede, pendencias: await aindaPendente() });

  // 1) exclusões feitas no aparelho
  for (const pacote of Object.keys(n.excluir || {})) {
    const r = await nuvemFetch(`/api/projetos/${encodeURIComponent(pacote)}`, { metodo: 'DELETE', token });
    if (r.status === 401) { await gravarNuvemStudio(nuvemPadrao()); return { ok: false, sessaoExpirada: true }; }
    if (r.ok || r.status === 404 || r.status === 400) {
      await alterarNuvemStudio((x) => { delete x.excluir[pacote]; delete x.versoes[pacote]; x.semCota = {}; }); // liberou espaço: tenta subir de novo
    } else return falha(r);
  }
  n = await lerNuvemStudio();

  // 2) o que existe no servidor
  const rl = await nuvemFetch('/api/projetos', { token });
  if (rl.status === 401) { await gravarNuvemStudio(nuvemPadrao()); return { ok: false, sessaoExpirada: true }; }
  if (!rl.ok) return falha(rl);
  const remotos = {};
  ((rl.dados && rl.dados.projetos) || []).forEach((p) => { remotos[p.pacote] = p; });
  const locais = {};
  (await lerListaProjetosStudio()).forEach((p) => { locais[p.pacote] = p; });

  for (const pacote of new Set([...Object.keys(remotos), ...Object.keys(locais)])) {
    if (n.excluir && n.excluir[pacote]) continue;
    const local = locais[pacote];
    const remoto = remotos[pacote];
    const ver = (n.versoes && n.versoes[pacote]) || 0;
    const marca = (n.pendentes && n.pendentes[pacote]) || 0;
    const tLocal = Math.max(marca, local ? local.atualizadoEm || 0 : 0);
    const localMudou = !!local && (marca > 0 || tLocal > ver);
    const remotoMudou = !!remoto && (remoto.atualizadoEm || 0) > ver;

    let acao = null;
    if (local && !remoto) acao = 'subir';
    else if (!local && remoto) acao = 'baixar';
    else if (local && remoto) {
      if (localMudou && remotoMudou) acao = tLocal >= (remoto.atualizadoEm || 0) ? 'subir' : 'baixar';
      else if (remotoMudou) acao = 'baixar';
      else if (localMudou) acao = 'subir';
    }
    if (!acao) continue;

    // projeto que a nuvem recusou por falta de espaço: não reenvia à toa (tenta de novo se mudar, se liberar espaço ou após 15 min)
    const sc0 = acao === 'subir' ? (n.semCota || {})[pacote] : null;
    if (sc0 && sc0.t === tLocal && Date.now() - sc0.em < 15 * 60 * 1000) continue;

    if (acao === 'subir') {
      const pacoteNuvem = await montarPacoteNuvem(pacote);
      if (!pacoteNuvem) { await alterarNuvemStudio((x) => { delete x.pendentes[pacote]; }); continue; }
      const quando = tLocal > 0 ? tLocal : Date.now();
      const resumo = { ...local };
      delete resumo.fotoIcone;
      delete resumo.atualizadoEm;
      const r = await nuvemFetch(`/api/projetos/${encodeURIComponent(pacote)}`, {
        metodo: 'PUT',
        token,
        timeoutMs: 180000,
        corpo: { atualizadoEm: quando, nomeApp: local.nomeApp, resumo, ...pacoteNuvem },
      });
      if (r.status === 401) { await gravarNuvemStudio(nuvemPadrao()); return { ok: false, sessaoExpirada: true }; }
      if (r.ok) {
        const v = (r.dados && r.dados.atualizadoEm) || quando;
        await alterarNuvemStudio((x) => {
          x.versoes[pacote] = v;
          if ((x.pendentes[pacote] || 0) <= marca) delete x.pendentes[pacote];
          if (x.semCota) delete x.semCota[pacote];
        });
        res.enviados += 1;
      } else if (r.status === 413 && r.dados && r.dados.erro === 'cota_nuvem') {
        // nuvem cheia: a última versão boa continua lá e o projeto continua no celular (nada é apagado)
        const jaAvisado = !!(sc0 && sc0.t === tLocal && sc0.avisado);
        await alterarNuvemStudio((x) => {
          x.semCota = x.semCota || {};
          x.semCota[pacote] = { t: tLocal, em: Date.now(), avisado: true };
          delete x.pendentes[pacote];
        });
        if (!jaAvisado) res.semCota.push(pacote);
      } else if (r.status === 400 || r.status === 413) {
        await alterarNuvemStudio((x) => { delete x.pendentes[pacote]; });
        res.rejeitados.push(pacote);
      } else return falha(r);
    } else {
      if (pacote === abertoPacote) { res.pendencias = true; continue; } // não troca o projeto que está aberto
      const r = await nuvemFetch(`/api/projetos/${encodeURIComponent(pacote)}`, { token, timeoutMs: 180000 });
      if (r.status === 401) { await gravarNuvemStudio(nuvemPadrao()); return { ok: false, sessaoExpirada: true }; }
      if (r.ok && r.dados) {
        try {
          await instalarProjetoDaNuvem(pacote, r.dados);
          await alterarNuvemStudio((x) => { x.versoes[pacote] = r.dados.atualizadoEm || remoto.atualizadoEm || 0; delete x.pendentes[pacote]; });
          res.baixados += 1;
          res.mudouLista = true;
        } catch (err) {
          res.rejeitados.push(pacote);
        }
      } else if (r.status === 404) continue;
      else return falha(r);
    }
  }
  res.pendencias = res.pendencias || (await aindaPendente());
  return res;
}

const nuvemStyles = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  card: {
    backgroundColor: '#120c2a',
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(180,60,255,0.35)',
    alignItems: 'stretch',
  },
  iconeTopo: {
    width: 64, height: 64, borderRadius: 32, overflow: 'hidden', alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  titulo: { color: COLORS.ink, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  sub: { color: COLORS.dim, fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  abas: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 4, marginBottom: 14 },
  aba: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center', overflow: 'hidden' },
  abaTexto: { color: COLORS.dim, fontWeight: '700', fontSize: 14 },
  abaTextoAtivo: { color: '#fff' },
  campo: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  input: { flex: 1, color: COLORS.ink, fontSize: 15.5, paddingVertical: 13 },
  erro: { color: COLORS.error, fontSize: 13, marginBottom: 8, textAlign: 'center' },
  botao: { borderRadius: 16, overflow: 'hidden', paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  botaoTexto: { color: '#fff', fontWeight: '800', fontSize: 16 },
  link: { paddingVertical: 12, alignItems: 'center' },
  linkTexto: { color: COLORS.dim, fontSize: 14, fontWeight: '600' },
  termos: { color: 'rgba(255,255,255,0.42)', fontSize: 11, lineHeight: 15.5, textAlign: 'center', marginTop: 6 },
  avatar: { width: 42, height: 42 },
  avatarBola: {
    width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(180,60,255,0.12)', borderWidth: 1.5, borderColor: 'rgba(180,60,255,0.7)',
  },
  avatarBolaLogado: {
    borderColor: 'rgba(255,255,255,0.35)', shadowColor: '#b43cff', shadowOpacity: 0.7, shadowRadius: 8, elevation: 6,
  },
  avatarLetra: { color: '#fff', fontSize: 18, fontWeight: '800' },
  avatarPonto: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: '#0b0720' },
  contaLetra: { color: '#fff', fontSize: 30, fontWeight: '800' },
  status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, marginBottom: 18 },
  statusTexto: { color: COLORS.dim, fontSize: 13.5, textAlign: 'center', flexShrink: 1 },
  botaoSec: {
    borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 10,
  },
  botaoPerigo: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,107,107,0.5)' },
});

// A "bolinha" ao lado do sino: pede login se não tem conta, e mostra a inicial do nome depois.
function BotaoContaNuvem({ nome, status, onPress }) {
  const logado = !!nome;
  const corPonto = status === 'sincronizando' ? COLORS.gold : status === 'offline' ? '#9aa0b4' : status === 'erro' ? COLORS.error : '#3ddc84';
  return (
    <TouchableOpacity style={nuvemStyles.avatar} onPress={onPress} activeOpacity={0.8}>
      <View style={[nuvemStyles.avatarBola, logado && nuvemStyles.avatarBolaLogado]}>
        {logado ? (
          <>
            <Grad />
            <Text style={nuvemStyles.avatarLetra}>{String(nome).charAt(0).toUpperCase()}</Text>
          </>
        ) : (
          <MaterialCommunityIcons name="account-outline" size={22} color={COLORS.ink} />
        )}
      </View>
      {logado && <View style={[nuvemStyles.avatarPonto, { backgroundColor: corPonto }]} />}
    </TouchableOpacity>
  );
}


// ── tela cheia de login / conta ──
const loginStyles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#07041a' },
  conteudo: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  corpo: { width: '100%', maxWidth: 440, alignSelf: 'center' },
  fechar: {
    position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, zIndex: 5,
    backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center',
  },
  topo: { alignItems: 'center' },
  logo: { width: 112, height: 112 },
  selo: {
    position: 'absolute', right: 2, bottom: 4, width: 32, height: 32, borderRadius: 16, backgroundColor: '#07041a',
    alignItems: 'center', justifyContent: 'center',
  },
  seloInterno: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  titulo: { color: '#fff', fontSize: 25, fontWeight: '900', textAlign: 'center', marginTop: 16, letterSpacing: 0.2 },
  sub: { color: COLORS.dim, fontSize: 14, textAlign: 'center', marginTop: 8, marginBottom: 26, lineHeight: 20, paddingHorizontal: 4 },
  rotulo: { color: 'rgba(255,255,255,0.55)', fontSize: 11.5, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7, marginLeft: 3 },
  campo: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 15, paddingHorizontal: 15, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.09)',
  },
  campoFoco: { borderColor: 'rgba(180,60,255,0.9)', backgroundColor: 'rgba(180,60,255,0.09)' },
  campoErro: { borderColor: 'rgba(255,107,107,0.7)' },
  input: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 14, marginLeft: 11 },
  dicaLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, marginBottom: 14, marginLeft: 3, minHeight: 16 },
  dicaTxt: { fontSize: 12, flexShrink: 1 },
  erroCaixa: {
    flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: 'rgba(255,107,107,0.1)',
    borderRadius: 12, paddingVertical: 11, paddingHorizontal: 13, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,107,107,0.35)',
  },
  erroTxt: { color: COLORS.error, fontSize: 12.5, flex: 1, lineHeight: 17 },
  botao: { borderRadius: 16, overflow: 'hidden', height: 56, alignItems: 'center', justifyContent: 'center' },
  botaoTxt: { color: '#fff', fontWeight: '900', fontSize: 16.5, letterSpacing: 0.4 },
  carregaFaixa: { position: 'absolute', bottom: 0, left: 0, height: 3, width: '35%', backgroundColor: 'rgba(255,255,255,0.85)' },
  dicaBotao: { color: 'rgba(255,255,255,0.45)', fontSize: 12.5, textAlign: 'center', marginTop: 12 },
  termosTxt: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 12, paddingHorizontal: 8 },
  termosLink: { color: '#d9a2ff', fontWeight: '700', textDecorationLine: 'underline' },
  linkSenha: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 10, marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkSenhaTxt: { color: COLORS.syntaxAttr, fontSize: 13, fontWeight: '700' },
  beneficios: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  beneficio: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  beneficioIcone: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(180,60,255,0.12)', alignItems: 'center',
    justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(180,60,255,0.22)',
  },
  beneficioTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5, textAlign: 'center', lineHeight: 15 },
  aviso: {
    flexDirection: 'row', gap: 11, alignItems: 'flex-start', marginTop: 24, padding: 14, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  avisoTxt: { color: 'rgba(255,255,255,0.58)', fontSize: 12, lineHeight: 17, flex: 1 },
  sucessoCaixa: { alignItems: 'center', paddingVertical: 20 },
  sucessoTitulo: { color: '#fff', fontSize: 23, fontWeight: '900' },
  sucessoSub: { color: COLORS.dim, fontSize: 14, marginTop: 8, textAlign: 'center' },
  contaRotulo: { color: 'rgba(255,255,255,0.5)', fontSize: 11.5, fontWeight: '800', letterSpacing: 1.1, textAlign: 'center', marginTop: 10 },
  contaNome: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 4 },
  contaCard: {
    marginTop: 22, marginBottom: 18, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: 16,
  },
  contaLinha: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14 },
  contaLinhaBorda: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  contaIcone: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contaLinhaTitulo: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  contaLinhaSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12.5, marginTop: 2 },
  botaoSec: {
    borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.07)',
    marginTop: 12, flexDirection: 'row', gap: 9,
  },
  botaoSecTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  botaoPerigo: {
    borderRadius: 16, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 12,
    borderWidth: 1, borderColor: 'rgba(255,107,107,0.55)', backgroundColor: 'rgba(255,107,107,0.08)',
  },
});

const NOME_VALIDO_NUVEM = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,19}$/;

// Abre o WhatsApp do suporte (redefinição de senha só pelo suporte).
async function abrirSuporteNuvem(usuario) {
  const texto = encodeURIComponent(
    usuario ? `Olá! Preciso redefinir a senha da minha conta no Cindra Studio. Meu usuário é: ${usuario}` : 'Olá! Preciso de ajuda com a minha conta no Cindra Studio.'
  );
  try {
    await Linking.openURL(`whatsapp://send?phone=${WHATS_SUPORTE}&text=${texto}`);
  } catch (e) {
    try {
      await Linking.openURL(`https://wa.me/${WHATS_SUPORTE}?text=${texto}`);
    } catch (e2) {
      exibirAviso('WhatsApp', 'Não consegui abrir o WhatsApp. Chame o suporte no número +55 31 98397-4632.', 'aviso');
    }
  }
}

function useLoopNuvem(ativo, duracao = 2200) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ativo) { v.setValue(0); return undefined; }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: duracao, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: duracao, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [ativo]);
  return v;
}

// Os blocos da tela entram um depois do outro (fade + subida).
function useEscalonadoNuvem(visible, n) {
  const vals = useRef(Array.from({ length: n }, () => new Animated.Value(0))).current;
  useEffect(() => {
    if (!visible) return;
    vals.forEach((v) => v.setValue(0));
    Animated.stagger(
      85,
      vals.map((v) => Animated.spring(v, { toValue: 1, friction: 9, tension: 60, useNativeDriver: true }))
    ).start();
  }, [visible]);
  return vals;
}
const entradaEstilo = (v) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] });

function useAlturaTecladoNuvem(ativo) {
  const [alt, setAlt] = useState(0);
  useEffect(() => {
    if (!ativo) { setAlt(0); return undefined; }
    const a = Keyboard.addListener('keyboardDidShow', (e) => setAlt((e && e.endCoordinates && e.endCoordinates.height) || 0));
    const b = Keyboard.addListener('keyboardDidHide', () => setAlt(0));
    return () => { a.remove(); b.remove(); };
  }, [ativo]);
  return alt;
}

// Selo de nuvem no canto da logo: muda conforme o estado.
function SeloNuvem({ status }) {
  const pop = useRef(new Animated.Value(1)).current;
  const pulso = useLoopNuvem(status === 'sincronizando', 650);
  useEffect(() => {
    pop.setValue(0.55);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, [status]);
  const mapa = {
    padrao: { i: 'cloud-outline', c: COLORS.emberDeep },
    ok: { i: 'cloud-check', c: '#2fcf7a' },
    sincronizando: { i: 'cloud-sync', c: '#e0a41b' },
    offline: { i: 'cloud-off-outline', c: '#7d8499' },
    erro: { i: 'cloud-alert', c: '#ff6b6b' },
  };
  const cfg = mapa[status] || mapa.padrao;
  return (
    <Animated.View style={[loginStyles.selo, { transform: [{ scale: Animated.multiply(pop, pulso.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] })) }] }]}>
      <View style={[loginStyles.seloInterno, { backgroundColor: cfg.c }]}>
        <MaterialCommunityIcons name={cfg.i} size={16} color="#ffffff" />
      </View>
    </Animated.View>
  );
}

// Logo do Cindra Studio (assets/cindra-logo.png) com o selo de nuvem, flutuando suave.
function IconeAppNuvem({ ativo, status = 'padrao' }) {
  const flutua = useLoopNuvem(ativo, 2300);
  return (
    <View style={loginStyles.topo}>
      <Animated.View style={{ transform: [{ translateY: flutua.interpolate({ inputRange: [0, 1], outputRange: [2, -4] }) }] }}>
        <Image source={require('./assets/cindra-logo.png')} style={loginStyles.logo} resizeMode="contain" />
        <SeloNuvem status={status} />
      </Animated.View>
    </View>
  );
}

function BotaoFecharNuvem({ onPress, topo }) {
  return (
    <TouchableOpacity style={[loginStyles.fechar, { top: topo + 10 }]} onPress={onPress} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <MaterialCommunityIcons name="close" size={22} color="#ffffff" />
    </TouchableOpacity>
  );
}

function AvisoSenhaNuvem({ texto }) {
  return (
    <View style={loginStyles.aviso}>
      <MaterialCommunityIcons name="shield-lock-outline" size={21} color={COLORS.gold} />
      <Text style={loginStyles.avisoTxt}>{texto}</Text>
    </View>
  );
}

const BENEFICIOS_NUVEM = [
  ['cloud-upload-outline', 'Backup automático'],
  ['cellphone-link', 'Em qualquer aparelho'],
  ['sync', 'Sincroniza sozinho'],
];

function LoginNuvemModal({ visible, convite, onFechar, onSucesso }) {
  const insets = useSafeAreaInsets();
  const teclado = useAlturaTecladoNuvem(visible);
  const bloco = useEscalonadoNuvem(visible, 5);
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [foco, setFoco] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(null); // { nome, criada } | null
  const [pontos, setPontos] = useState(0);
  const shake = useRef(new Animated.Value(0)).current;
  const faixa = useRef(new Animated.Value(0)).current;
  const erroAnim = useRef(new Animated.Value(0)).current;
  const sucessoAnim = useRef(new Animated.Value(0)).current;
  const inputSenhaRef = useRef(null);

  useEffect(() => {
    if (visible) { setErro(''); setSenha(''); setVer(false); setSucesso(null); setEnviando(false); }
  }, [visible]);

  useEffect(() => {
    Animated.timing(erroAnim, { toValue: erro ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [erro]);

  // "Conectando..." com pontinhos + faixa de carregamento correndo no botão.
  useEffect(() => {
    if (!enviando) return undefined;
    setPontos(0);
    const t = setInterval(() => setPontos((p) => (p + 1) % 4), 380);
    faixa.setValue(0);
    const anim = Animated.loop(Animated.timing(faixa, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    anim.start();
    return () => { clearInterval(t); anim.stop(); };
  }, [enviando]);

  const tremer = () => {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };
  const falhar = (msg) => { setErro(msg); tremer(); };

  const nomeTxt = nome.trim();
  const nomeOk = NOME_VALIDO_NUVEM.test(nomeTxt);
  const senhaOk = senha.length >= 6;
  const pronto = nomeOk && senhaOk;

  const enviar = async () => {
    if (enviando || sucesso) return;
    Keyboard.dismiss();
    if (!nomeOk) { falhar('O nome deve ter de 3 a 20 caracteres: letras, números, ponto, traço ou _ (sem espaços).'); return; }
    if (!senhaOk) { falhar('A senha precisa ter pelo menos 6 caracteres.'); return; }
    setErro('');
    setEnviando(true);
    const r = await entrarNuvemStudio(nomeTxt, senha);
    setEnviando(false);
    if (!r.ok) { falhar(r.mensagem); return; }
    setSenha('');
    setSucesso({ nome: r.nome, criada: r.criada });
    sucessoAnim.setValue(0);
    Animated.spring(sucessoAnim, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    setTimeout(() => onSucesso({ token: r.token, nome: r.nome }), 1100);
  };

  // dica embaixo do nome
  let dicaNome = { icone: 'information-outline', cor: 'rgba(255,255,255,0.45)', txt: '3 a 20 caracteres: letras, números, ponto, traço ou _' };
  if (nome.length > 0) {
    dicaNome = nomeOk
      ? { icone: 'check-circle', cor: '#3ddc84', txt: 'Nome válido' }
      : { icone: 'alert-circle-outline', cor: '#ffb020', txt: nome.length < 3 ? 'Use pelo menos 3 caracteres' : 'Sem espaços ou símbolos (só letras, números, . - _)' };
  }
  const dicaSenha = senhaOk
    ? { icone: 'check-circle', cor: '#3ddc84', txt: 'Senha ok' }
    : { icone: 'information-outline', cor: 'rgba(255,255,255,0.45)', txt: 'Mínimo de 6 caracteres' };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFechar} statusBarTranslucent>
      <View style={loginStyles.tela}>
        <ScrollView
          contentContainerStyle={[loginStyles.conteudo, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 + teclado }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={loginStyles.corpo}>
            <Animated.View style={entradaEstilo(bloco[0])}>
              <IconeAppNuvem ativo={visible} status={sucesso ? 'ok' : enviando ? 'sincronizando' : 'padrao'} />
            </Animated.View>

            {sucesso ? (
              <Animated.View style={[loginStyles.sucessoCaixa, { opacity: sucessoAnim, transform: [{ scale: sucessoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}>
                <Text style={loginStyles.sucessoTitulo}>{sucesso.criada ? 'Conta criada!' : 'Conectado!'}</Text>
                <Text style={loginStyles.sucessoSub}>Olá, {sucesso.nome}. Sincronizando seus projetos…</Text>
                <ActivityIndicator style={{ marginTop: 18 }} color={COLORS.ember} />
              </Animated.View>
            ) : (
              <>
                <Animated.View style={entradaEstilo(bloco[1])}>
                  <Text style={loginStyles.titulo}>{convite ? 'Salve seus projetos na nuvem' : 'Acesse sua conta'}</Text>
                  <Text style={loginStyles.sub}>
                    Entre com seu nome e senha. Se ainda não tem conta, a gente cria na hora.
                  </Text>
                </Animated.View>

                <Animated.View style={[entradaEstilo(bloco[2]), { transform: [...entradaEstilo(bloco[2]).transform, { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] }) }] }]}>
                  <Text style={loginStyles.rotulo}>USUÁRIO</Text>
                  <View style={[loginStyles.campo, foco === 'nome' && loginStyles.campoFoco]}>
                    <MaterialCommunityIcons name="account-outline" size={22} color={foco === 'nome' ? COLORS.ember : COLORS.dim} />
                    <TextInput
                      style={loginStyles.input}
                      value={nome}
                      onChangeText={(t) => { setNome(t); if (erro) setErro(''); }}
                      placeholder="Seu nome de usuário"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={20}
                      returnKeyType="next"
                      onFocus={() => setFoco('nome')}
                      onBlur={() => setFoco(null)}
                      onSubmitEditing={() => inputSenhaRef.current && inputSenhaRef.current.focus()}
                      editable={!enviando}
                    />
                  </View>
                  <View style={loginStyles.dicaLinha}>
                    <MaterialCommunityIcons name={dicaNome.icone} size={15} color={dicaNome.cor} />
                    <Text style={[loginStyles.dicaTxt, { color: dicaNome.cor }]}>{dicaNome.txt}</Text>
                  </View>

                  <Text style={loginStyles.rotulo}>SENHA</Text>
                  <View style={[loginStyles.campo, foco === 'senha' && loginStyles.campoFoco]}>
                    <MaterialCommunityIcons name="lock-outline" size={22} color={foco === 'senha' ? COLORS.ember : COLORS.dim} />
                    <TextInput
                      ref={inputSenhaRef}
                      style={loginStyles.input}
                      value={senha}
                      onChangeText={(t) => { setSenha(t); if (erro) setErro(''); }}
                      placeholder="Sua senha"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                      secureTextEntry={!ver}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={100}
                      returnKeyType="go"
                      onFocus={() => setFoco('senha')}
                      onBlur={() => setFoco(null)}
                      onSubmitEditing={enviar}
                      editable={!enviando}
                    />
                    <TouchableOpacity onPress={() => setVer(!ver)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <MaterialCommunityIcons name={ver ? 'eye-off-outline' : 'eye-outline'} size={22} color={COLORS.dim} />
                    </TouchableOpacity>
                  </View>
                  <View style={loginStyles.dicaLinha}>
                    <MaterialCommunityIcons name={dicaSenha.icone} size={15} color={dicaSenha.cor} />
                    <Text style={[loginStyles.dicaTxt, { color: dicaSenha.cor }]}>{dicaSenha.txt}</Text>
                  </View>

                  {!!erro && (
                    <Animated.View style={[loginStyles.erroCaixa, { opacity: erroAnim, transform: [{ translateY: erroAnim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }]}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={19} color={COLORS.error} />
                      <Text style={loginStyles.erroTxt}>{erro}</Text>
                    </Animated.View>
                  )}

                  <TouchableOpacity style={loginStyles.botao} onPress={enviar} activeOpacity={0.9} disabled={enviando}>
                    <Grad />
                    {!pronto && !enviando && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7,4,26,0.4)' }]} />}
                    {enviando ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <ActivityIndicator color="#fff" />
                        <Text style={loginStyles.botaoTxt}>Conectando{'.'.repeat(pontos)}</Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                        <MaterialCommunityIcons name="login-variant" size={21} color="#fff" />
                        <Text style={loginStyles.botaoTxt}>Entrar / Criar</Text>
                      </View>
                    )}
                    {enviando && (
                      <Animated.View style={[loginStyles.carregaFaixa, { transform: [{ translateX: faixa.interpolate({ inputRange: [0, 1], outputRange: [-120, 380] }) }] }]} />
                    )}
                  </TouchableOpacity>

                  <Text style={loginStyles.termosTxt}>
                    Ao continuar, você concorda com os{' '}
                    <Text style={loginStyles.termosLink} onPress={() => abrirLinkNoApp(URL_TERMOS_STUDIO)}>Termos de Uso</Text>
                    {' '}e a{' '}
                    <Text style={loginStyles.termosLink} onPress={() => abrirLinkNoApp(URL_PRIVACIDADE_STUDIO)}>Política de Privacidade</Text>.
                  </Text>

                  <TouchableOpacity style={loginStyles.linkSenha} onPress={() => abrirSuporteNuvem(nomeTxt)} activeOpacity={0.7}>
                    <MaterialCommunityIcons name="lifebuoy" size={16} color={COLORS.syntaxAttr} />
                    <Text style={loginStyles.linkSenhaTxt}>Esqueceu a senha? Falar com o suporte</Text>
                  </TouchableOpacity>
                </Animated.View>

                <Animated.View style={entradaEstilo(bloco[3])}>
                  <View style={loginStyles.beneficios}>
                    {BENEFICIOS_NUVEM.map(([icone, rotulo]) => (
                      <View key={rotulo} style={loginStyles.beneficio}>
                        <View style={loginStyles.beneficioIcone}>
                          <MaterialCommunityIcons name={icone} size={22} color={COLORS.ember} />
                        </View>
                        <Text style={loginStyles.beneficioTxt}>{rotulo}</Text>
                      </View>
                    ))}
                  </View>
                </Animated.View>

                <Animated.View style={entradaEstilo(bloco[4])}>
                  <AvisoSenhaNuvem texto="Este login serve apenas para salvar seus projetos na nuvem. Não existe recuperação automática de senha: só o suporte consegue redefinir. Guarde bem a sua senha." />
                </Animated.View>
              </>
            )}
          </View>
        </ScrollView>
        <BotaoFecharNuvem onPress={onFechar} topo={insets.top} />
      </View>
    </Modal>
  );
}

function ContaNuvemModal({ visible, nome, status, ultima, totalProjetos, onFechar, onSincronizar, onSair }) {
  const insets = useSafeAreaInsets();
  const bloco = useEscalonadoNuvem(visible, 4);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [, setRelogio] = useState(0);
  useEffect(() => { if (!visible) setConfirmarSaida(false); }, [visible]);
  // atualiza o "há X s" enquanto a tela está aberta
  useEffect(() => {
    if (!visible) return undefined;
    const t = setInterval(() => setRelogio((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [visible]);

  const seg = ultima ? Math.max(0, Math.round((Date.now() - ultima) / 1000)) : null;
  const quando = seg === null ? '' : seg < 5 ? 'agora mesmo' : seg < 60 ? `há ${seg} s` : `há ${Math.round(seg / 60)} min`;
  const info = status === 'sincronizando'
    ? { titulo: 'Sincronizando…', sub: 'Enviando e recebendo seus projetos', cor: '#e0a41b', icone: 'cloud-sync' }
    : status === 'offline'
      ? { titulo: 'Sem internet', sub: 'Sincroniza sozinho quando voltar', cor: '#7d8499', icone: 'cloud-off-outline' }
      : status === 'erro'
        ? { titulo: 'Falha ao sincronizar', sub: 'Tentando de novo automaticamente', cor: '#ff6b6b', icone: 'cloud-alert' }
        : { titulo: 'Tudo salvo na nuvem', sub: quando ? `Última sincronização ${quando}` : 'Conta conectada', cor: '#2fcf7a', icone: 'cloud-check' };
  const selo = status === 'sincronizando' || status === 'offline' || status === 'erro' ? status : 'ok';
  const n = totalProjetos || 0;

  const linhas = [
    { icone: info.icone, cor: info.cor, titulo: info.titulo, sub: info.sub },
    { icone: 'folder-multiple-outline', cor: COLORS.emberDeep, titulo: `${n} ${n === 1 ? 'projeto' : 'projetos'} no aparelho`, sub: 'Todos são salvos na sua pasta na nuvem' },
    { icone: 'timer-sand', cor: COLORS.ember, titulo: 'Sincronização automática', sub: 'Confere o servidor a cada 5 segundos' },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onFechar} statusBarTranslucent>
      <View style={loginStyles.tela}>
        <ScrollView
          contentContainerStyle={[loginStyles.conteudo, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={loginStyles.corpo}>
            <Animated.View style={entradaEstilo(bloco[0])}>
              <IconeAppNuvem ativo={visible} status={selo} />
              <Text style={loginStyles.contaRotulo}>CONTA CINDRA</Text>
              <Text style={loginStyles.contaNome}>{nome}</Text>
            </Animated.View>

            <Animated.View style={entradaEstilo(bloco[1])}>
              <View style={loginStyles.contaCard}>
                {linhas.map((l, idx) => (
                  <View key={l.titulo} style={[loginStyles.contaLinha, idx > 0 && loginStyles.contaLinhaBorda]}>
                    <View style={[loginStyles.contaIcone, { backgroundColor: `${l.cor}22` }]}>
                      <MaterialCommunityIcons name={l.icone} size={21} color={l.cor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={loginStyles.contaLinhaTitulo}>{l.titulo}</Text>
                      <Text style={loginStyles.contaLinhaSub}>{l.sub}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Animated.View>

            <Animated.View style={entradaEstilo(bloco[2])}>
              <TouchableOpacity style={loginStyles.botao} onPress={onSincronizar} activeOpacity={0.88}>
                <Grad />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <MaterialCommunityIcons name="sync" size={21} color="#fff" />
                  <Text style={loginStyles.botaoTxt}>Sincronizar agora</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={loginStyles.botaoSec} onPress={() => abrirSuporteNuvem(nome)} activeOpacity={0.85}>
                <MaterialCommunityIcons name="lifebuoy" size={20} color="#fff" />
                <Text style={loginStyles.botaoSecTxt}>Falar com o suporte</Text>
              </TouchableOpacity>

              {confirmarSaida ? (
                <TouchableOpacity style={loginStyles.botaoPerigo} onPress={onSair} activeOpacity={0.85}>
                  <Text style={[loginStyles.botaoSecTxt, { color: COLORS.error }]}>Toque de novo para sair</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={loginStyles.botaoSec} onPress={() => setConfirmarSaida(true)} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="logout" size={20} color="#fff" />
                  <Text style={loginStyles.botaoSecTxt}>Sair da conta</Text>
                </TouchableOpacity>
              )}
            </Animated.View>

            <Animated.View style={entradaEstilo(bloco[3])}>
              <AvisoSenhaNuvem texto="Ao sair, seus projetos continuam no celular e na nuvem. Esqueceu a senha? Só o suporte consegue redefinir." />
            </Animated.View>
          </View>
        </ScrollView>
        <BotaoFecharNuvem onPress={onFechar} topo={insets.top} />
      </View>
    </Modal>
  );
}

// Item que entra com fade + subida suave (o atraso cresce com a posição na lista).
// `leve`: só um fade curtinho, sem subir e sem atraso — usado no editor de
// código, onde mover o TextInput durante a animação fazia o cursor e as cores
// ficarem "pulando" por um instante.
function ItemAnimadoStudio({ indice = 0, style, children, leve = false }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: leve ? 140 : 320,
      delay: leve ? 0 : Math.min(indice, 8) * 50,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);
  return (
    <Animated.View
      style={[
        style,
        leve
          ? { opacity: anim }
          : { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────
// Editor liso: cada linha colorida e a coluna de números são componentes
// memoizados. Antes, TODA tecla refazia a cor das ~100 linhas da janela
// (regex + dezenas de <Text> aninhados) e só depois a camada colorida
// alcançava o TextInput nativo — era isso que deixava o "|" na frente da
// letra. Agora só a linha que mudou é refeita; o resto nem re-renderiza.
// ─────────────────────────────────────────────────────────
const LIMITE_CACHE_TOKENS = 4000;
function tokenizarLinhaCache(linha, regex) {
  if (!regex || !linha) return [{ t: linha || '', c: null }];
  let cache = regex.__cacheTokens;
  if (!cache) { cache = new Map(); regex.__cacheTokens = cache; }
  let r = cache.get(linha);
  if (r) return r;
  r = tokenizarLinha(linha, regex);
  if (cache.size >= LIMITE_CACHE_TOKENS) cache.clear();
  cache.set(linha, r);
  return r;
}

const LinhaCodigoStudio = React.memo(function LinhaCodigoStudio({ texto, top, fonte, altura, regex }) {
  return (
    <Text
      numberOfLines={1}
      allowFontScaling={false}
      style={[studioStyles.codeHighlightLine, { top, fontSize: fonte, lineHeight: altura }]}
    >
      {texto === ''
        ? ' '
        : tokenizarLinhaCache(texto, regex).map((p, idx) => (
          <Text key={idx} allowFontScaling={false} style={p.c ? { color: p.c } : null}>{p.t}</Text>
        ))}
    </Text>
  );
});

// A "janela" (quais linhas estão desenhadas) vive num mini-store fora do
// estado da tela. Antes, cada vez que a rolagem andava ~15 linhas, o
// setState refazia a tela INTEIRA do Studio (9 mil linhas de JSX) — era o
// travamento ao descer rápido, e o código vazio aparecia porque a janela
// chegava atrasada. Agora só os 3 componentes abaixo re-renderizam.
function criarStoreJanela(inicial) {
  let v = inicial;
  const subs = new Set();
  return {
    get: () => v,
    set: (n) => {
      if (n.inicio === v.inicio && n.fim === v.fim) return;
      v = n;
      subs.forEach((f) => f(n));
    },
    sub: (f) => { subs.add(f); return () => subs.delete(f); },
  };
}
function useJanelaStore(store, total) {
  const [j, setJ] = useState(store.get());
  useEffect(() => {
    setJ(store.get());
    return store.sub(setJ);
  }, [store]);
  const inicio = Math.max(0, Math.min(j.inicio, total));
  const fim = Math.max(inicio, Math.min(j.fim, total));
  return { inicio, fim };
}

const NumerosJanelaStudio = React.memo(function NumerosJanelaStudio({ store, total, altura, larguraTexto, zoom, errosSet, mostrarErros }) {
  const { inicio, fim } = useJanelaStore(store, total);
  return (
    <NumerosLinhasStudio inicio={inicio} fim={fim} altura={altura} larguraTexto={larguraTexto} zoom={zoom} errosSet={errosSet} mostrarErros={mostrarErros} />
  );
});

const LinhasCoresJanelaStudio = React.memo(function LinhasCoresJanelaStudio({ store, linhas, altura, zoom, regex }) {
  const { inicio, fim } = useJanelaStore(store, linhas.length);
  const itens = [];
  for (let i = inicio; i < fim; i++) {
    itens.push(
      <LinhaCodigoStudio
        key={i}
        texto={linhas[i] !== undefined ? linhas[i] : ''}
        top={14 + i * altura}
        fonte={CODIGO_FONTE * zoom}
        altura={altura}
        regex={regex}
      />
    );
  }
  return <>{itens}</>;
});

const MarcasBuscaJanelaStudio = React.memo(function MarcasBuscaJanelaStudio({ store, total, marcas, idxBusca, altura, zoom }) {
  const { inicio, fim } = useJanelaStore(store, total);
  return (
    <>
      {marcas.filter((m) => m.i >= inicio && m.i < fim).map((m) => (
        <View
          key={`bm${m.k}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 12 + m.col * CODIGO_FONTE * 0.6 * zoom,
            top: 14 + m.i * altura + 1,
            width: m.len * CODIGO_FONTE * 0.6 * zoom,
            height: altura - 2,
            borderRadius: 3,
            backgroundColor: m.k === idxBusca ? 'rgba(255,170,0,0.55)' : 'rgba(255,214,10,0.22)',
          }}
        />
      ))}
    </>
  );
});

const NumerosLinhasStudio = React.memo(function NumerosLinhasStudio({ inicio, fim, altura, larguraTexto, zoom, errosSet, mostrarErros }) {
  const itens = [];
  for (let i = inicio; i < fim; i++) {
    itens.push(
      <Text
        key={i}
        allowFontScaling={false}
        style={[
          studioStyles.lineNumberText,
          { position: 'absolute', top: 14 + i * altura, right: 8, width: larguraTexto, fontSize: 13 * zoom, lineHeight: altura },
          mostrarErros && errosSet.has(i + 1) && { color: COLORS.error, fontWeight: '800' },
        ]}
      >
        {i + 1}
      </Text>
    );
  }
  return <>{itens}</>;
});

// Folha que sobe do rodapé (com fundo escurecendo). "children" recebe a
// função fechar(), que anima a saída e só depois chama onFechar.
function FolhaInferiorStudio({ onFechar, insetBottom = 0, children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  const fechar = () => {
    Animated.timing(anim, { toValue: 0, duration: 170, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => { if (finished) onFechar(); }
    );
  };
  return (
    <View style={[StyleSheet.absoluteFill, studioStyles.overlayRaiz]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.62)', opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} />
      </Animated.View>
      <Animated.View
        style={[
          studioStyles.folha,
          {
            paddingBottom: insetBottom + 18,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }],
          },
        ]}
      >
        <View style={studioStyles.folhaAlca} />
        {typeof children === 'function' ? children(fechar) : children}
      </Animated.View>
    </View>
  );
}

// Painel lateral (explorador de arquivos) que desliza a partir da
// esquerda, no mesmo espírito de animação da FolhaInferiorStudio —
// fundo escurecendo + painel entrando com easing suave.
function PainelLateralStudio({ onFechar, children, largura = '86%' }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  const fechar = () => {
    Animated.timing(anim, { toValue: 0, duration: 190, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => { if (finished) onFechar(); }
    );
  };
  return (
    <View style={[StyleSheet.absoluteFill, studioStyles.overlayRaiz]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} />
      </Animated.View>
      <Animated.View
        style={[
          studioStyles.sidebarPanel,
          {
            width: largura,
            opacity: anim,
            transform: [
              { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) },
            ],
          },
        ]}
      >
        {typeof children === 'function' ? children(fechar) : children}
      </Animated.View>
    </View>
  );
}

// Conteúdo da folha de ações de um projeto (abrir / favoritar / excluir com
// confirmação em 2 passos).
function ConteudoFolhaProjeto({ projeto, onAbrir, onFavoritar, onExcluir, onCancelar, onLerVersao, onSalvarVersao }) {
  const [confirmando, setConfirmando] = useState(false);
  const [editandoVersao, setEditandoVersao] = useState(false);
  const [verNome, setVerNome] = useState('1.0');
  const [verCodigo, setVerCodigo] = useState('1');
  const [carregandoVersao, setCarregandoVersao] = useState(false);
  const [salvandoVersao, setSalvandoVersao] = useState(false);
  const abrirVersao = async () => {
    setEditandoVersao(true);
    setCarregandoVersao(true);
    try {
      const v = await onLerVersao();
      setVerNome(v.nome);
      setVerCodigo(String(v.codigo));
    } catch (e) {
      setVerNome(projeto.versaoNome || '1.0');
      setVerCodigo(String(projeto.versaoCodigo || 1));
    }
    setCarregandoVersao(false);
  };
  const salvarVersao = async () => {
    setSalvandoVersao(true);
    const ok = await onSalvarVersao(verNome, verCodigo);
    setSalvandoVersao(false);
    if (ok) onCancelar();
  };
  return (
    <>
      <View style={studioStyles.folhaTopo}>
        <IconeAppStudio dados={projeto} lado={48} icone={26} raio={15} />
        <View style={{ flex: 1 }}>
          <Text style={studioStyles.folhaTitulo} numberOfLines={1}>{projeto.nomeApp}</Text>
          <Text style={studioStyles.folhaSub} numberOfLines={1}>
            {projeto.pacote}{projeto.atualizadoEm ? `  ·  ${tempoRelativoStudio(projeto.atualizadoEm)}` : ''}
          </Text>
        </View>
      </View>

      {editandoVersao ? (
        <View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1.4 }}>
              <Text style={[studioStyles.cfgLabel, { marginTop: 4 }]}>Versão</Text>
              <View style={studioStyles.cfgCampo}>
                <MaterialCommunityIcons name="tag-outline" size={18} color={COLORS.dim} />
                <TextInput
                  style={studioStyles.cfgCampoInput}
                  value={verNome}
                  onChangeText={(t) => setVerNome(t.replace(/[^0-9A-Za-z._+-]/g, ''))}
                  placeholder="1.0"
                  placeholderTextColor={COLORS.dim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  editable={!carregandoVersao}
                />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[studioStyles.cfgLabel, { marginTop: 4 }]}>Código</Text>
              <View style={studioStyles.cfgCampo}>
                <MaterialCommunityIcons name="pound" size={18} color={COLORS.dim} />
                <TextInput
                  style={studioStyles.cfgCampoInput}
                  value={verCodigo}
                  onChangeText={(t) => setVerCodigo(t.replace(/\D/g, ''))}
                  placeholder="1"
                  placeholderTextColor={COLORS.dim}
                  keyboardType="number-pad"
                  maxLength={9}
                  editable={!carregandoVersao}
                />
              </View>
            </View>
          </View>
          <Text style={studioStyles.cfgHint}>
            Versão é o texto que a pessoa vê (ex.: 1.2). O código é um número que só pode subir: pra atualizar um app já instalado, use um código maior que o dele.
          </Text>
          <View style={[studioStyles.folhaConfirmaBotoes, { marginTop: 14 }]}>
            <TouchableOpacity style={studioStyles.folhaBtn} onPress={() => setEditandoVersao(false)} activeOpacity={0.8}>
              <Text style={studioStyles.folhaBtnTexto}>Voltar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[studioStyles.folhaBtn, { backgroundColor: COLORS.ember }, (carregandoVersao || salvandoVersao) && { opacity: 0.6 }]}
              onPress={salvarVersao}
              activeOpacity={0.85}
              disabled={carregandoVersao || salvandoVersao}
            >
              {salvandoVersao
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <Text style={[studioStyles.folhaBtnTexto, { color: '#ffffff', fontWeight: '800' }]}>Salvar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : confirmando ? (
        <View style={studioStyles.folhaConfirma}>
          <Text style={studioStyles.folhaConfirmaTexto}>
            Excluir "{projeto.nomeApp}" de vez? Todos os arquivos do projeto serão apagados e isso não dá pra desfazer.
          </Text>
          <View style={studioStyles.folhaConfirmaBotoes}>
            <TouchableOpacity style={studioStyles.folhaBtn} onPress={() => setConfirmando(false)} activeOpacity={0.8}>
              <Text style={studioStyles.folhaBtnTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[studioStyles.folhaBtn, studioStyles.folhaBtnPerigo]} onPress={onExcluir} activeOpacity={0.85}>
              <Text style={[studioStyles.folhaBtnTexto, { color: '#ffffff' }]}>Excluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <TouchableOpacity style={studioStyles.folhaLinha} onPress={onAbrir} activeOpacity={0.8}>
            <MaterialCommunityIcons name="folder-open-outline" size={20} color={COLORS.ink} />
            <Text style={studioStyles.folhaLinhaTexto}>Abrir app</Text>
          </TouchableOpacity>
          <TouchableOpacity style={studioStyles.folhaLinha} onPress={onFavoritar} activeOpacity={0.8}>
            <MaterialCommunityIcons name={projeto.favorito ? 'star-off-outline' : 'star-outline'} size={20} color={COLORS.gold} />
            <Text style={[studioStyles.folhaLinhaTexto, { color: COLORS.gold }]}>
              {projeto.favorito ? 'Remover dos favoritos' : 'Favoritar'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={studioStyles.folhaLinha} onPress={abrirVersao} activeOpacity={0.8}>
            <MaterialCommunityIcons name="tag-outline" size={20} color={COLORS.ink} />
            <Text style={studioStyles.folhaLinhaTexto}>Versão</Text>
            {!!projeto.versaoNome && (
              <Text style={{ color: COLORS.dim, fontSize: 13, fontWeight: '600' }}>
                {projeto.versaoNome}{projeto.versaoCodigo ? ` (${projeto.versaoCodigo})` : ''}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={studioStyles.folhaLinha} onPress={() => setConfirmando(true)} activeOpacity={0.8}>
            <MaterialCommunityIcons name="delete-outline" size={20} color="#ff8a80" />
            <Text style={[studioStyles.folhaLinhaTexto, { color: '#ff8a80' }]}>Excluir app</Text>
          </TouchableOpacity>
        </>
      )}
    </>
  );
}

// Ícone do app nos cards/listas: a foto escolhida, ou o robozinho na cor.
function IconeAppStudio({ dados, lado = 52, icone = 28, raio = 16 }) {
  const [falhou, setFalhou] = useState(false);
  const uriFoto = dados && dados.fotoIcone ? dados.fotoIcone : null;
  useEffect(() => { setFalhou(false); }, [uriFoto]);
  if (uriFoto && !falhou) {
    return (
      <Image
        source={{ uri: uriFoto }}
        onError={() => setFalhou(true)}
        style={{ width: lado, height: lado, borderRadius: raio, backgroundColor: '#140d28' }}
      />
    );
  }
  return (
    <View
      style={{
        width: lado,
        height: lado,
        borderRadius: raio,
        backgroundColor: (dados && dados.corIcone) || CORES_ICONE_STUDIO[0],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <MaterialCommunityIcons name={(dados && dados.iconeEscolhido) || ICONES_APP_STUDIO[0]} size={icone} color="#ffffff" />
    </View>
  );
}

// Histórico de desfazer/refazer: guarda só o TRECHO que mudou (posição,
// texto removido, texto inserido), não o arquivo inteiro. Cada evento de
// digitação vira 1 passo (letra por letra); colar um bloco é 1 evento só,
// então desfazer tira o bloco colado de uma vez.
// ─────────────────────────────────────────────────────────
// Aba "Aprender": exemplos de código prontos pra copiar.
// Cada exemplo tem 1+ blocos (MainActivity, manifest, outros arquivos).
// Os códigos usam só o Android puro (sem AndroidX) e classes anônimas
// no lugar de lambdas, pra compilar em qualquer configuração do Studio.
// ─────────────────────────────────────────────────────────
const JAVA = String.raw;

const AVISO_PACKAGE = 'Cole embaixo da linha "package ..." do seu MainActivity.java (apague o resto e deixe só o package no topo).';

const EXEMPLOS_APRENDER = [
  // ═══════════════ TELAS E BOTÕES ═══════════════
  {
    categoria: 'Telas e botões',
    icone: 'gesture-tap-button',
    itens: [
      {
        id: 'botao',
        titulo: 'Botão simples',
        icone: 'gesture-tap',
        descricao: 'Um botão no centro da tela que mostra um aviso (Toast) quando é tocado.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.Toast;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Button botao = new Button(this);
        botao.setText("Toque aqui");
        botao.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Toast.makeText(MainActivity.this, "Você tocou!", Toast.LENGTH_SHORT).show();
            }
        });

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botao, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'contador',
        titulo: 'Contador',
        icone: 'counter',
        descricao: 'Um número grande na tela e um botão que soma +1 a cada toque.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    private int contagem = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));

        final TextView numero = new TextView(this);
        numero.setText("0");
        numero.setTextColor(Color.WHITE);
        numero.setTextSize(56);
        numero.setGravity(Gravity.CENTER);

        Button mais = new Button(this);
        mais.setText("+1");
        mais.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                contagem++;
                numero.setText(String.valueOf(contagem));
            }
        });

        raiz.addView(numero);
        raiz.addView(mais);
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'varios',
        titulo: 'Vários botões (menu)',
        icone: 'format-list-bulleted',
        descricao: 'Uma coluna de botões largos, criados por um laço. Ideal pra menu inicial.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;

public class MainActivity extends Activity {

    private int dp(int valor) {
        return (int) (valor * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setPadding(dp(24), dp(24), dp(24), dp(24));
        raiz.setBackgroundColor(Color.parseColor("#03050a"));

        String[] nomes = {"Jogar", "Opções", "Sobre", "Sair"};
        for (final String nome : nomes) {
            Button b = new Button(this);
            b.setText(nome);
            b.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    Toast.makeText(MainActivity.this, "Você escolheu: " + nome, Toast.LENGTH_SHORT).show();
                }
            });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.setMargins(0, 0, 0, dp(12));
            raiz.addView(b, lp);
        }

        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'arredondado',
        titulo: 'Botão arredondado colorido',
        icone: 'palette-outline',
        descricao: 'Botão com cor própria e cantos redondos (GradientDrawable). Troque a cor no código.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    private int dp(int valor) {
        return (int) (valor * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        GradientDrawable fundo = new GradientDrawable();
        fundo.setColor(Color.parseColor("#ff5227")); // cor do botão
        fundo.setCornerRadius(dp(28));               // quanto mais, mais redondo

        Button botao = new Button(this);
        botao.setText("Começar");
        botao.setTextColor(Color.WHITE);
        botao.setAllCaps(false);
        botao.setBackground(fundo);
        botao.setPadding(dp(36), dp(14), dp(36), dp(14));

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botao, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'campo',
        titulo: 'Campo de texto',
        icone: 'form-textbox',
        descricao: 'Um campo onde a pessoa digita e um botão que mostra o que foi escrito.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    private int dp(int valor) {
        return (int) (valor * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setPadding(dp(24), dp(24), dp(24), dp(24));
        raiz.setBackgroundColor(Color.parseColor("#03050a"));

        final EditText campo = new EditText(this);
        campo.setHint("Digite seu nome");
        campo.setHintTextColor(Color.GRAY);
        campo.setTextColor(Color.WHITE);
        campo.setSingleLine(true);

        final TextView resposta = new TextView(this);
        resposta.setTextColor(Color.WHITE);
        resposta.setTextSize(20);
        resposta.setGravity(Gravity.CENTER);
        resposta.setPadding(0, dp(16), 0, 0);

        Button ok = new Button(this);
        ok.setText("Enviar");
        ok.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String nome = campo.getText().toString().trim();
                resposta.setText("Olá, " + nome + "!");
            }
        });

        raiz.addView(campo);
        raiz.addView(ok);
        raiz.addView(resposta);
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'lista',
        titulo: 'Lista de itens',
        icone: 'format-list-checkbox',
        descricao: 'Uma lista rolável. Tocar num item mostra qual foi escolhido.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.Toast;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final String[] itens = {"Maçã", "Banana", "Uva", "Manga", "Laranja", "Melancia"};

        ListView lista = new ListView(this);
        lista.setBackgroundColor(Color.parseColor("#03050a"));
        lista.setAdapter(new ArrayAdapter<String>(
                this, android.R.layout.simple_list_item_1, itens));
        lista.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> pai, View view, int posicao, long id) {
                Toast.makeText(MainActivity.this, itens[posicao], Toast.LENGTH_SHORT).show();
            }
        });

        setContentView(lista);
    }
}`,
        }],
      },
      {
        id: 'trocar',
        titulo: 'Trocar de tela',
        icone: 'swap-horizontal',
        descricao: 'Duas telas (menu e jogo) dentro do mesmo app. O botão de cada uma troca pra outra.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    private View telaMenu;
    private View telaJogo;

    // Monta uma tela simples com título e um botão
    private View criarTela(String titulo, String textoBotao, View.OnClickListener acao) {
        LinearLayout tela = new LinearLayout(this);
        tela.setOrientation(LinearLayout.VERTICAL);
        tela.setGravity(Gravity.CENTER);
        tela.setBackgroundColor(Color.parseColor("#03050a"));

        TextView t = new TextView(this);
        t.setText(titulo);
        t.setTextColor(Color.WHITE);
        t.setTextSize(32);
        t.setGravity(Gravity.CENTER);

        Button b = new Button(this);
        b.setText(textoBotao);
        b.setOnClickListener(acao);

        tela.addView(t);
        tela.addView(b);
        return tela;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        telaMenu = criarTela("Menu", "Ir para o jogo", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setContentView(telaJogo);
            }
        });

        telaJogo = criarTela("Jogo", "Voltar ao menu", new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setContentView(telaMenu);
            }
        });

        setContentView(telaMenu);
    }
}`,
        }],
      },
      {
        id: 'arrastar',
        titulo: 'Arrastar com o dedo',
        icone: 'drag',
        descricao: 'Um quadrado que segue o dedo. Base pra personagem, joystick ou peça de jogo.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    private int dp(int valor) {
        return (int) (valor * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));

        View quadrado = new View(this);
        quadrado.setBackgroundColor(Color.parseColor("#ff5227"));
        raiz.addView(quadrado, new FrameLayout.LayoutParams(dp(90), dp(90)));

        quadrado.setOnTouchListener(new View.OnTouchListener() {
            float deslocX, deslocY;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        deslocX = v.getX() - e.getRawX();
                        deslocY = v.getY() - e.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        v.setX(e.getRawX() + deslocX);
                        v.setY(e.getRawY() + deslocY);
                        return true;
                }
                return false;
            }
        });

        setContentView(raiz);
    }
}`,
        }],
      },
    ],
  },

  // ═══════════════ BARRAS E TELA ═══════════════
  {
    categoria: 'Barras e tela',
    icone: 'fullscreen',
    itens: [
      {
        id: 'imersivo',
        titulo: 'Esconder barra de navegação',
        icone: 'fullscreen',
        descricao: 'Esconde a barra de baixo (botões do Android) e a de cima (hora, bateria). Passar o dedo na borda mostra elas por um instante.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.widget.TextView;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        TextView texto = new TextView(this);
        texto.setText("Tela cheia!");
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(28);
        texto.setGravity(Gravity.CENTER);
        texto.setBackgroundColor(Color.parseColor("#03050a"));
        setContentView(texto);
    }

    // Esconde de novo toda vez que o app volta a ter foco
    @Override
    public void onWindowFocusChanged(boolean temFoco) {
        super.onWindowFocusChanged(temFoco);
        if (temFoco) {
            esconderBarras();
        }
    }

    private void esconderBarras() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }
}`,
        }],
      },
      {
        id: 'statusbar',
        titulo: 'Esconder só a barra de cima',
        icone: 'battery-outline',
        descricao: 'Tira a barra de status (hora, sinal, bateria) e deixa a de navegação.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.TextView;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Tem que vir antes do setContentView
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);

        TextView texto = new TextView(this);
        texto.setText("Sem barra de status");
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(24);
        texto.setGravity(Gravity.CENTER);
        texto.setBackgroundColor(Color.parseColor("#03050a"));
        setContentView(texto);
    }
}`,
        }],
      },
      {
        id: 'ligada',
        titulo: 'Manter a tela ligada',
        icone: 'brightness-7',
        descricao: 'A tela não apaga sozinha enquanto o app está aberto. Bom pra jogo, vídeo e cronômetro.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.TextView;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        TextView texto = new TextView(this);
        texto.setText("A tela não apaga");
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(24);
        texto.setGravity(Gravity.CENTER);
        texto.setBackgroundColor(Color.parseColor("#03050a"));
        setContentView(texto);
    }
}`,
        }],
      },
      {
        id: 'orientacao',
        titulo: 'Em pé ou deitado',
        icone: 'screen-rotation',
        descricao: 'Troca a orientação da tela pelo código, com dois botões. Pra fixar de vez, use screenOrientation no manifest.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));

        Button emPe = new Button(this);
        emPe.setText("Em pé");
        emPe.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            }
        });

        Button deitado = new Button(this);
        deitado.setText("Deitado");
        deitado.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
            }
        });

        Button livre = new Button(this);
        livre.setText("Automático (gira com o celular)");
        livre.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
            }
        });

        raiz.addView(emPe);
        raiz.addView(deitado);
        raiz.addView(livre);
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'voltar',
        titulo: 'Confirmar ao sair',
        icone: 'exit-to-app',
        descricao: 'Ao apertar o botão voltar do Android, pergunta "Sair?" antes de fechar o app.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        TextView texto = new TextView(this);
        texto.setText("Aperte o botão voltar");
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(22);
        texto.setGravity(Gravity.CENTER);
        texto.setBackgroundColor(Color.parseColor("#03050a"));
        setContentView(texto);
    }

    @Override
    public void onBackPressed() {
        new AlertDialog.Builder(this)
                .setTitle("Sair?")
                .setMessage("Quer mesmo fechar o app?")
                .setNegativeButton("Não", null)
                .setPositiveButton("Sim", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialogo, int quala) {
                        finish();
                    }
                })
                .show();
    }
}`,
        }],
      },
    ],
  },

  // ═══════════════ AVISOS ═══════════════
  {
    categoria: 'Avisos e balão',
    icone: 'bell-ring-outline',
    itens: [
      {
        id: 'dialogo',
        titulo: 'Caixa de diálogo',
        icone: 'message-alert-outline',
        descricao: 'Uma janelinha com título, mensagem e botões (OK / Cancelar).',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.Toast;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Button botao = new Button(this);
        botao.setText("Abrir aviso");
        botao.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Atenção")
                        .setMessage("Deseja continuar?")
                        .setNegativeButton("Cancelar", null)
                        .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialogo, int quala) {
                                Toast.makeText(MainActivity.this, "Você disse OK", Toast.LENGTH_SHORT).show();
                            }
                        })
                        .show();
            }
        });

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botao, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'notificacao',
        titulo: 'Notificação',
        icone: 'bell-outline',
        descricao: 'Mostra uma notificação na barra do celular. No Android 13+ o app pede a permissão na primeira vez.',
        blocos: [
          {
            rotulo: 'AndroidManifest.xml — adicione antes de <application>',
            codigo: JAVA`<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`,
          },
          {
            rotulo: 'MainActivity.java',
            codigo: JAVA`import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    private static final String CANAL_ID = "avisos";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Android 13+: pede permissão pra mostrar notificação
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }

        // Android 8+: toda notificação precisa de um "canal"
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel canal = new NotificationChannel(
                    CANAL_ID, "Avisos", NotificationManager.IMPORTANCE_DEFAULT);
            NotificationManager gerente =
                    (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            gerente.createNotificationChannel(canal);
        }

        Button botao = new Button(this);
        botao.setText("Mostrar notificação");
        botao.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                mostrarNotificacao();
            }
        });

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botao, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        setContentView(raiz);
    }

    private void mostrarNotificacao() {
        // Ao tocar na notificação, abre o app
        Intent abrir = new Intent(this, MainActivity.class);
        PendingIntent toque = PendingIntent.getActivity(
                this, 0, abrir, PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder n;
        if (Build.VERSION.SDK_INT >= 26) {
            n = new Notification.Builder(this, CANAL_ID);
        } else {
            n = new Notification.Builder(this);
        }
        n.setSmallIcon(android.R.drawable.ic_dialog_info);
        n.setContentTitle("Olá!");
        n.setContentText("Essa é uma notificação do meu app");
        n.setContentIntent(toque);
        n.setAutoCancel(true);

        NotificationManager gerente =
                (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        gerente.notify(1, n.build());
    }
}`,
          },
        ],
      },
      {
        id: 'balao',
        titulo: 'Balão flutuante',
        icone: 'chat-processing-outline',
        descricao: 'Uma bolinha que fica por cima de outros apps e dá pra arrastar. Precisa de 3 passos: manifest, MainActivity e um arquivo novo (BalaoService.java).',
        blocos: [
          {
            rotulo: '1) AndroidManifest.xml — permissão (antes de <application>)',
            codigo: JAVA`<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />`,
          },
          {
            rotulo: '2) AndroidManifest.xml — dentro de <application>',
            codigo: JAVA`<service
    android:name=".BalaoService"
    android:exported="false" />`,
          },
          {
            rotulo: '3) MainActivity.java',
            codigo: JAVA`import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Button mostrar = new Button(this);
        mostrar.setText("Mostrar balão");
        mostrar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                boolean semPermissao = Build.VERSION.SDK_INT >= 23
                        && !Settings.canDrawOverlays(MainActivity.this);
                if (semPermissao) {
                    Toast.makeText(MainActivity.this,
                            "Ative \"Aparecer sobre outros apps\" e volte", Toast.LENGTH_LONG).show();
                    Intent pedir = new Intent(
                            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                            Uri.parse("package:" + getPackageName()));
                    startActivity(pedir);
                } else {
                    startService(new Intent(MainActivity.this, BalaoService.class));
                }
            }
        });

        Button remover = new Button(this);
        remover.setText("Remover balão");
        remover.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                stopService(new Intent(MainActivity.this, BalaoService.class));
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(mostrar);
        raiz.addView(remover);
        setContentView(raiz);
    }
}`,
          },
          {
            rotulo: '4) Arquivo NOVO: BalaoService.java (mesma pasta do MainActivity, com o mesmo "package ..." na 1ª linha)',
            codigo: JAVA`import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import android.widget.Toast;

public class BalaoService extends Service {

    private WindowManager janela;
    private View balao;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (balao != null) {
            return START_STICKY; // já está na tela
        }
        janela = (WindowManager) getSystemService(Context.WINDOW_SERVICE);

        // A bolinha (círculo laranja com uma letra)
        TextView texto = new TextView(this);
        texto.setText("C");
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(22);
        texto.setGravity(Gravity.CENTER);
        GradientDrawable fundo = new GradientDrawable();
        fundo.setShape(GradientDrawable.OVAL);
        fundo.setColor(Color.parseColor("#ff5227"));
        texto.setBackground(fundo);
        balao = texto;

        int tamanho = (int) (60 * getResources().getDisplayMetrics().density);
        int tipo;
        if (Build.VERSION.SDK_INT >= 26) {
            tipo = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            tipo = WindowManager.LayoutParams.TYPE_PHONE;
        }

        final WindowManager.LayoutParams p = new WindowManager.LayoutParams(
                tamanho, tamanho, tipo,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        p.gravity = Gravity.TOP | Gravity.START;
        p.x = 100;
        p.y = 300;

        // Arrastar com o dedo; toque rápido = ação do balão
        balao.setOnTouchListener(new View.OnTouchListener() {
            private int xInicial, yInicial;
            private float toqueX, toqueY;
            private boolean moveu;

            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        xInicial = p.x;
                        yInicial = p.y;
                        toqueX = e.getRawX();
                        toqueY = e.getRawY();
                        moveu = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - toqueX;
                        float dy = e.getRawY() - toqueY;
                        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                            moveu = true;
                        }
                        p.x = xInicial + (int) dx;
                        p.y = yInicial + (int) dy;
                        janela.updateViewLayout(balao, p);
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moveu) {
                            // Toque simples: coloque aqui o que o balão faz
                            Toast.makeText(BalaoService.this, "Balão tocado!", Toast.LENGTH_SHORT).show();
                        }
                        return true;
                }
                return false;
            }
        });

        janela.addView(balao, p);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (balao != null) {
            janela.removeView(balao);
            balao = null;
        }
    }
}`,
          },
        ],
      },
      {
        id: 'vibrar',
        titulo: 'Vibrar',
        icone: 'vibrate',
        descricao: 'Faz o celular vibrar por 300 milissegundos quando o botão é tocado.',
        blocos: [
          {
            rotulo: 'AndroidManifest.xml — adicione antes de <application>',
            codigo: JAVA`<uses-permission android:name="android.permission.VIBRATE" />`,
          },
          {
            rotulo: 'MainActivity.java',
            codigo: JAVA`import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final Vibrator vibrador = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);

        Button botao = new Button(this);
        botao.setText("Vibrar");
        botao.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (Build.VERSION.SDK_INT >= 26) {
                    vibrador.vibrate(VibrationEffect.createOneShot(300, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrador.vibrate(300);
                }
            }
        });

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botao, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        setContentView(raiz);
    }
}`,
          },
        ],
      },
    ],
  },

  // ═══════════════ SISTEMA ═══════════════
  {
    categoria: 'Sistema e internet',
    icone: 'cellphone-cog',
    itens: [
      {
        id: 'link',
        titulo: 'Abrir um site',
        icone: 'open-in-new',
        descricao: 'Abre um endereço no navegador do celular.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Button botao = new Button(this);
        botao.setText("Abrir site");
        botao.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent abrir = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com"));
                startActivity(abrir);
            }
        });

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botao, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'compartilhar',
        titulo: 'Compartilhar texto',
        icone: 'share-variant-outline',
        descricao: 'Abre o menu de compartilhar do Android (WhatsApp, Telegram, e-mail...) com um texto pronto.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Button botao = new Button(this);
        botao.setText("Compartilhar");
        botao.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent enviar = new Intent(Intent.ACTION_SEND);
                enviar.setType("text/plain");
                enviar.putExtra(Intent.EXTRA_TEXT, "Olha o app que eu fiz no CindraStudio!");
                startActivity(Intent.createChooser(enviar, "Compartilhar via"));
            }
        });

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botao, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'permissao',
        titulo: 'Pedir permissão',
        icone: 'shield-key-outline',
        descricao: 'Pede uma permissão à pessoa na hora (exemplo com a câmera) e mostra se ela aceitou. Serve de modelo pra microfone, localização etc.',
        blocos: [
          {
            rotulo: 'AndroidManifest.xml — adicione antes de <application>',
            codigo: JAVA`<uses-permission android:name="android.permission.CAMERA" />`,
          },
          {
            rotulo: 'MainActivity.java',
            codigo: JAVA`import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.Toast;

public class MainActivity extends Activity {

    private static final int CODIGO_CAMERA = 10;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Button botao = new Button(this);
        botao.setText("Pedir permissão da câmera");
        botao.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                boolean precisaPedir = Build.VERSION.SDK_INT >= 23
                        && checkSelfPermission(Manifest.permission.CAMERA)
                        != PackageManager.PERMISSION_GRANTED;
                if (precisaPedir) {
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CODIGO_CAMERA);
                } else {
                    Toast.makeText(MainActivity.this, "Já tenho permissão!", Toast.LENGTH_SHORT).show();
                }
            }
        });

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botao, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        setContentView(raiz);
    }

    // Chamado quando a pessoa responde ao pedido
    @Override
    public void onRequestPermissionsResult(int codigo, String[] permissoes, int[] resultados) {
        super.onRequestPermissionsResult(codigo, permissoes, resultados);
        if (codigo == CODIGO_CAMERA) {
            boolean aceitou = resultados.length > 0
                    && resultados[0] == PackageManager.PERMISSION_GRANTED;
            String msg = aceitou ? "Permissão concedida" : "Permissão negada";
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
        }
    }
}`,
          },
        ],
      },
      {
        id: 'webview',
        titulo: 'Site dentro do app (WebView)',
        icone: 'web',
        descricao: 'Mostra uma página da internet dentro do seu app. O botão voltar navega no histórico do site.',
        blocos: [
          {
            rotulo: 'AndroidManifest.xml — adicione antes de <application>',
            codigo: JAVA`<uses-permission android:name="android.permission.INTERNET" />`,
          },
          {
            rotulo: 'MainActivity.java',
            codigo: JAVA`import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.setWebViewClient(new WebViewClient()); // links abrem aqui dentro
        web.loadUrl("https://www.google.com");     // use https://

        setContentView(web);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }
}`,
          },
        ],
      },
    ],
  },

  // ═══════════════ MÍDIA ═══════════════
  {
    categoria: 'Som e imagem',
    icone: 'music-note-outline',
    itens: [
      {
        id: 'bipe',
        titulo: 'Tocar um bipe',
        icone: 'volume-high',
        descricao: 'Toca um som curto sem precisar de nenhum arquivo.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    private ToneGenerator tom;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        tom = new ToneGenerator(AudioManager.STREAM_MUSIC, 100);

        Button botao = new Button(this);
        botao.setText("Bipe");
        botao.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                tom.startTone(ToneGenerator.TONE_PROP_BEEP, 200);
            }
        });

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botao, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        setContentView(raiz);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        tom.release();
    }
}`,
        }],
      },
      {
        id: 'somassets',
        titulo: 'Tocar música (assets)',
        icone: 'music',
        descricao: 'Toca um arquivo de som que você adicionou na pasta assets (segure o dedo na pasta e use "Adicionar arquivo"). Troque "musica.mp3" pelo nome do seu arquivo.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;

import java.io.File;

public class MainActivity extends Activity {

    private MediaPlayer player;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Button tocar = new Button(this);
        tocar.setText("Tocar");
        tocar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    if (player != null) {
                        player.release();
                    }
                    // o arquivo fica cifrado dentro do app; AssetCripto decifra
                    // pra um arquivo temporário antes de tocar.
                    File arquivo = AssetCripto.paraArquivoTemporario(MainActivity.this, "musica.mp3");
                    player = new MediaPlayer();
                    player.setDataSource(arquivo.getAbsolutePath());
                    player.setLooping(true);
                    player.prepare();
                    player.start();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Erro: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
        });

        Button parar = new Button(this);
        parar.setText("Parar");
        parar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (player != null) {
                    player.release();
                    player = null;
                }
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(tocar);
        raiz.addView(parar);
        setContentView(raiz);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (player != null) {
            player.release();
            player = null;
        }
    }
}`,
        }],
      },
      {
        id: 'imagem',
        titulo: 'Mostrar imagem (assets)',
        icone: 'image-outline',
        descricao: 'Mostra uma imagem que você adicionou na pasta assets. Troque "foto.png" pelo nome do seu arquivo.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.ImageView;
import android.widget.Toast;

import java.io.InputStream;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ImageView imagem = new ImageView(this);
        imagem.setBackgroundColor(Color.parseColor("#03050a"));
        imagem.setScaleType(ImageView.ScaleType.FIT_CENTER);

        try {
            // o arquivo fica cifrado dentro do app; AssetCripto decifra em memória.
            InputStream entrada = AssetCripto.abrir(this, "foto.png");
            Bitmap bmp = BitmapFactory.decodeStream(entrada);
            entrada.close();
            imagem.setImageBitmap(bmp);
        } catch (Exception e) {
            Toast.makeText(this, "Imagem não encontrada em assets", Toast.LENGTH_LONG).show();
        }

        setContentView(imagem);
    }
}`,
        }],
      },
    ],
  },

  // ═══════════════ DADOS E TEMPO ═══════════════
  {
    categoria: 'Dados, tempo e sensores',
    icone: 'database-outline',
    itens: [
      {
        id: 'salvar',
        titulo: 'Salvar dados',
        icone: 'content-save-outline',
        descricao: 'Guarda um número no celular. Fecha o app, abre de novo e o valor continua lá (SharedPreferences).',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SharedPreferences prefs = getSharedPreferences("dados", MODE_PRIVATE);

        // Lê o que estava salvo (0 se for a primeira vez) e soma 1
        int aberturas = prefs.getInt("aberturas", 0) + 1;

        // Salva o novo valor
        prefs.edit().putInt("aberturas", aberturas).apply();

        TextView texto = new TextView(this);
        texto.setText("Você abriu o app " + aberturas + " vez(es)");
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(22);
        texto.setGravity(Gravity.CENTER);
        texto.setBackgroundColor(Color.parseColor("#03050a"));
        setContentView(texto);
    }
}`,
        }],
      },
      {
        id: 'timer',
        titulo: 'Contagem regressiva',
        icone: 'timer-outline',
        descricao: 'Conta de 10 até 0, uma vez por segundo, e avisa quando acabar.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.view.Gravity;
import android.widget.TextView;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final TextView texto = new TextView(this);
        texto.setText("10");
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(64);
        texto.setGravity(Gravity.CENTER);
        texto.setBackgroundColor(Color.parseColor("#03050a"));
        setContentView(texto);

        // 10000 ms no total, atualizando a cada 1000 ms
        new CountDownTimer(10000, 1000) {
            @Override
            public void onTick(long faltam) {
                texto.setText(String.valueOf(faltam / 1000));
            }

            @Override
            public void onFinish() {
                texto.setText("Acabou!");
            }
        }.start();
    }
}`,
        }],
      },
      {
        id: 'animacao',
        titulo: 'Animação',
        icone: 'animation-play-outline',
        descricao: 'O botão dá uma "pulsada" (cresce e volta) a cada toque, e o quadrado gira.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;

public class MainActivity extends Activity {

    private int dp(int valor) {
        return (int) (valor * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));

        final View quadrado = new View(this);
        quadrado.setBackgroundColor(Color.parseColor("#ff5227"));
        raiz.addView(quadrado, new LinearLayout.LayoutParams(dp(100), dp(100)));

        Button botao = new Button(this);
        botao.setText("Animar");
        botao.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(final View v) {
                // Pulsada no botão: cresce e volta
                v.animate().scaleX(1.25f).scaleY(1.25f).setDuration(150)
                        .withEndAction(new Runnable() {
                            @Override
                            public void run() {
                                v.animate().scaleX(1f).scaleY(1f).setDuration(150).start();
                            }
                        }).start();

                // Quadrado dá uma volta completa
                quadrado.animate().rotationBy(360f).setDuration(600).start();
            }
        });
        raiz.addView(botao);

        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'sensor',
        titulo: 'Sensor de movimento',
        icone: 'axis-arrow',
        descricao: 'Lê o acelerômetro e mostra os valores X, Y e Z. Incline o celular pra ver mudar. Base pra jogos controlados inclinando.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

public class MainActivity extends Activity implements SensorEventListener {

    private SensorManager sensores;
    private TextView texto;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        sensores = (SensorManager) getSystemService(Context.SENSOR_SERVICE);

        texto = new TextView(this);
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(22);
        texto.setGravity(Gravity.CENTER);
        texto.setBackgroundColor(Color.parseColor("#03050a"));
        setContentView(texto);
    }

    @Override
    protected void onResume() {
        super.onResume();
        Sensor acelerometro = sensores.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        sensores.registerListener(this, acelerometro, SensorManager.SENSOR_DELAY_GAME);
    }

    @Override
    protected void onPause() {
        super.onPause();
        sensores.unregisterListener(this);
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        texto.setText("X: " + e.values[0] + "\nY: " + e.values[1] + "\nZ: " + e.values[2]);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int precisao) {
    }
}`,
        }],
      },
    ],
  },
  // ═══════════════ RECURSOS DO CELULAR ═══════════════
  {
    categoria: 'Recursos do celular',
    icone: 'cellphone-cog',
    itens: [
      {
        id: 'lanterna',
        titulo: 'Lanterna',
        icone: 'flashlight',
        descricao: 'Liga e desliga o flash do celular como lanterna. Não precisa de permissão. A lanterna apaga sozinha quando você sai do app.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.Toast;

public class MainActivity extends Activity {

    private CameraManager camera;
    private String idCamera = null;
    private boolean ligada = false;
    private Button botao;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        camera = (CameraManager) getSystemService(Context.CAMERA_SERVICE);

        // Procura a câmera que tem flash
        try {
            for (String id : camera.getCameraIdList()) {
                Boolean temFlash = camera.getCameraCharacteristics(id)
                        .get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                if (temFlash != null && temFlash) {
                    idCamera = id;
                    break;
                }
            }
        } catch (CameraAccessException e) {
            idCamera = null;
        }

        botao = new Button(this);
        botao.setText("Ligar lanterna");
        botao.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                trocar(!ligada);
            }
        });

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botao, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));
        setContentView(raiz);
    }

    private void trocar(boolean ligar) {
        if (idCamera == null) {
            Toast.makeText(this, "Este celular não tem flash", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            camera.setTorchMode(idCamera, ligar);
            ligada = ligar;
            botao.setText(ligada ? "Desligar lanterna" : "Ligar lanterna");
        } catch (CameraAccessException e) {
            Toast.makeText(this, "Não consegui usar o flash", Toast.LENGTH_SHORT).show();
        }
    }

    // Apaga a lanterna ao sair do app
    @Override
    protected void onPause() {
        super.onPause();
        if (ligada) {
            trocar(false);
        }
    }
}`,
        }],
      },
      {
        id: 'gps',
        titulo: 'Localização (GPS)',
        icone: 'map-marker-radius-outline',
        descricao: 'Pede a permissão de localização, mostra latitude e longitude em tempo real e tem um botão pra abrir o ponto no mapa. Teste com o GPS do celular ligado e, de preferência, ao ar livre.',
        blocos: [
          {
            rotulo: 'AndroidManifest.xml — adicione antes de <application>',
            codigo: JAVA`<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />`,
          },
          {
            rotulo: 'MainActivity.java',
            codigo: JAVA`import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity implements LocationListener {

    private static final int CODIGO_GPS = 20;

    private LocationManager gerente;
    private TextView texto;
    private Location ultima = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        gerente = (LocationManager) getSystemService(Context.LOCATION_SERVICE);

        texto = new TextView(this);
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(20);
        texto.setGravity(Gravity.CENTER);
        texto.setText("Procurando sinal de GPS...");

        Button mapa = new Button(this);
        mapa.setText("Ver no mapa");
        mapa.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (ultima == null) {
                    Toast.makeText(MainActivity.this, "Ainda sem localização", Toast.LENGTH_SHORT).show();
                    return;
                }
                Uri lugar = Uri.parse("geo:" + ultima.getLatitude() + "," + ultima.getLongitude()
                        + "?q=" + ultima.getLatitude() + "," + ultima.getLongitude());
                startActivity(new Intent(Intent.ACTION_VIEW, lugar));
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setPadding(40, 40, 40, 40);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(texto);
        raiz.addView(mapa);
        setContentView(raiz);

        if (Build.VERSION.SDK_INT >= 23
                && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, CODIGO_GPS);
        } else {
            comecar();
        }
    }

    private void comecar() {
        try {
            if (gerente.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                gerente.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 0, this);
            } else {
                texto.setText("Ligue o GPS do celular");
            }
        } catch (SecurityException e) {
            texto.setText("Sem permissão de localização");
        }
    }

    @Override
    public void onRequestPermissionsResult(int codigo, String[] permissoes, int[] resultados) {
        super.onRequestPermissionsResult(codigo, permissoes, resultados);
        if (codigo == CODIGO_GPS) {
            if (resultados.length > 0 && resultados[0] == PackageManager.PERMISSION_GRANTED) {
                comecar();
            } else {
                texto.setText("Permissão negada");
            }
        }
    }

    @Override
    public void onLocationChanged(Location local) {
        ultima = local;
        texto.setText("Latitude: " + local.getLatitude()
                + "\nLongitude: " + local.getLongitude()
                + "\nPrecisão: " + local.getAccuracy() + " m");
    }

    @Override
    public void onStatusChanged(String provedor, int status, Bundle extras) {
    }

    @Override
    public void onProviderEnabled(String provedor) {
    }

    @Override
    public void onProviderDisabled(String provedor) {
    }

    // Para de gastar bateria quando o app fecha
    @Override
    protected void onDestroy() {
        super.onDestroy();
        gerente.removeUpdates(this);
    }
}`,
          },
        ],
      },
      {
        id: 'tarefas',
        titulo: 'Lista de tarefas (banco de dados)',
        icone: 'database-outline',
        descricao: 'Lista de tarefas que fica salva de verdade num banco SQLite: fecha o app, abre de novo e tudo continua lá. Digite e toque em Adicionar; segure o dedo numa tarefa pra apagar.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import java.util.ArrayList;

public class MainActivity extends Activity {

    // Cria o banco na primeira vez que o app abre
    static class Banco extends SQLiteOpenHelper {
        Banco(Context contexto) {
            super(contexto, "tarefas.db", null, 1);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE tarefas (id INTEGER PRIMARY KEY AUTOINCREMENT, texto TEXT)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int antiga, int nova) {
            db.execSQL("DROP TABLE IF EXISTS tarefas");
            onCreate(db);
        }
    }

    private Banco banco;
    private ArrayList<Long> ids = new ArrayList<Long>();
    private ArrayList<String> textos = new ArrayList<String>();
    private ArrayAdapter<String> adaptador;
    private EditText campo;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        banco = new Banco(this);

        campo = new EditText(this);
        campo.setHint("Nova tarefa");
        campo.setTextColor(Color.WHITE);
        campo.setHintTextColor(Color.GRAY);

        Button adicionar = new Button(this);
        adicionar.setText("Adicionar");
        adicionar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String t = campo.getText().toString().trim();
                if (t.length() == 0) {
                    return;
                }
                ContentValues valores = new ContentValues();
                valores.put("texto", t);
                banco.getWritableDatabase().insert("tarefas", null, valores);
                campo.setText("");
                carregar();
            }
        });

        adaptador = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, textos);
        ListView lista = new ListView(this);
        lista.setAdapter(adaptador);

        // Segurar o dedo numa tarefa apaga ela
        lista.setOnItemLongClickListener(new AdapterView.OnItemLongClickListener() {
            @Override
            public boolean onItemLongClick(AdapterView<?> pai, View item, int posicao, long id) {
                banco.getWritableDatabase().delete("tarefas", "id = ?",
                        new String[]{String.valueOf(ids.get(posicao))});
                carregar();
                return true;
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(30, 30, 30, 30);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(campo);
        raiz.addView(adicionar);
        raiz.addView(lista);
        setContentView(raiz);

        carregar();
    }

    // Lê tudo do banco e atualiza a lista na tela
    private void carregar() {
        ids.clear();
        textos.clear();
        Cursor c = banco.getReadableDatabase()
                .rawQuery("SELECT id, texto FROM tarefas ORDER BY id DESC", null);
        while (c.moveToNext()) {
            ids.add(c.getLong(0));
            textos.add(c.getString(1));
        }
        c.close();
        adaptador.notifyDataSetChanged();
    }
}`,
        }],
      },
    ],
  },
  // ═══════════════ FERRAMENTAS E JOGOS ═══════════════
  {
    categoria: 'Ferramentas e jogos',
    icone: 'toolbox-outline',
    itens: [
      {
        id: 'calculadora',
        titulo: 'Calculadora',
        icone: 'calculator',
        descricao: 'Dois campos de número e quatro botões (+ − x ÷). Mostra o resultado na hora e avisa se tentar dividir por zero.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    private EditText campoA;
    private EditText campoB;
    private TextView resultado;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        campoA = novoCampo("Primeiro número");
        campoB = novoCampo("Segundo número");

        resultado = new TextView(this);
        resultado.setTextColor(Color.WHITE);
        resultado.setTextSize(28);
        resultado.setGravity(Gravity.CENTER);
        resultado.setPadding(0, 40, 0, 0);

        LinearLayout botoes = new LinearLayout(this);
        botoes.setOrientation(LinearLayout.HORIZONTAL);
        char[] operacoes = {'+', '-', 'x', '/'};
        for (char op : operacoes) {
            botoes.addView(novoBotao(op), new LinearLayout.LayoutParams(
                    0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        }

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(40, 60, 40, 40);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(campoA);
        raiz.addView(campoB);
        raiz.addView(botoes);
        raiz.addView(resultado);
        setContentView(raiz);
    }

    private EditText novoCampo(String dica) {
        EditText c = new EditText(this);
        c.setHint(dica);
        c.setHintTextColor(Color.GRAY);
        c.setTextColor(Color.WHITE);
        c.setInputType(InputType.TYPE_CLASS_NUMBER
                | InputType.TYPE_NUMBER_FLAG_DECIMAL
                | InputType.TYPE_NUMBER_FLAG_SIGNED);
        return c;
    }

    private Button novoBotao(final char op) {
        Button b = new Button(this);
        b.setText(String.valueOf(op));
        b.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                calcular(op);
            }
        });
        return b;
    }

    private void calcular(char op) {
        double x;
        double y;
        try {
            x = Double.parseDouble(campoA.getText().toString());
            y = Double.parseDouble(campoB.getText().toString());
        } catch (NumberFormatException e) {
            resultado.setText("Digite os dois números");
            return;
        }

        double r;
        if (op == '+') {
            r = x + y;
        } else if (op == '-') {
            r = x - y;
        } else if (op == 'x') {
            r = x * y;
        } else {
            if (y == 0) {
                resultado.setText("Não dá pra dividir por zero");
                return;
            }
            r = x / y;
        }

        // Mostra 5 em vez de 5.0 quando o resultado é inteiro
        if (r == Math.floor(r)) {
            resultado.setText(String.valueOf((long) r));
        } else {
            resultado.setText(String.valueOf(r));
        }
    }
}`,
        }],
      },
      {
        id: 'cronometro',
        titulo: 'Cronômetro',
        icone: 'timer-outline',
        descricao: 'Cronômetro com minutos, segundos e centésimos. Iniciar/pausar e zerar. Usa um Handler que se repete a cada 50 milissegundos.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    private Handler handler = new Handler();
    private TextView tela;
    private Button botaoIniciar;
    private boolean rodando = false;
    private long inicio = 0;
    private long acumulado = 0;

    private Runnable atualizar = new Runnable() {
        @Override
        public void run() {
            if (rodando) {
                mostrar(acumulado + SystemClock.elapsedRealtime() - inicio);
                handler.postDelayed(this, 50);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        tela = new TextView(this);
        tela.setTextColor(Color.WHITE);
        tela.setTextSize(48);
        tela.setGravity(Gravity.CENTER);
        mostrar(0);

        botaoIniciar = new Button(this);
        botaoIniciar.setText("Iniciar");
        botaoIniciar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                alternar();
            }
        });

        Button zerar = new Button(this);
        zerar.setText("Zerar");
        zerar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                rodando = false;
                acumulado = 0;
                botaoIniciar.setText("Iniciar");
                mostrar(0);
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setPadding(40, 40, 40, 40);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(tela);
        raiz.addView(botaoIniciar);
        raiz.addView(zerar);
        setContentView(raiz);
    }

    private void alternar() {
        if (rodando) {
            acumulado += SystemClock.elapsedRealtime() - inicio;
            rodando = false;
            botaoIniciar.setText("Continuar");
        } else {
            inicio = SystemClock.elapsedRealtime();
            rodando = true;
            botaoIniciar.setText("Pausar");
            handler.post(atualizar);
        }
    }

    private void mostrar(long ms) {
        long centesimos = (ms / 10) % 100;
        long segundos = (ms / 1000) % 60;
        long minutos = ms / 60000;
        tela.setText(String.format("%02d:%02d.%02d", minutos, segundos, centesimos));
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacks(atualizar);
    }
}`,
        }],
      },
      {
        id: 'relogio',
        titulo: 'Relógio digital',
        icone: 'clock-digital',
        descricao: 'Mostra a hora e a data de hoje, atualizando a cada segundo. Para de atualizar quando o app sai da tela, pra não gastar bateria.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.widget.TextView;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {

    private Handler handler = new Handler();
    private TextView tela;
    private SimpleDateFormat formato =
            new SimpleDateFormat("HH:mm:ss\nEEEE, dd/MM/yyyy", Locale.getDefault());

    private Runnable atualizar = new Runnable() {
        @Override
        public void run() {
            tela.setText(formato.format(new Date()));
            handler.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        tela = new TextView(this);
        tela.setTextColor(Color.WHITE);
        tela.setTextSize(34);
        tela.setGravity(Gravity.CENTER);
        tela.setBackgroundColor(Color.parseColor("#03050a"));
        setContentView(tela);
    }

    @Override
    protected void onResume() {
        super.onResume();
        handler.post(atualizar);
    }

    @Override
    protected void onPause() {
        super.onPause();
        handler.removeCallbacks(atualizar);
    }
}`,
        }],
      },
      {
        id: 'dado',
        titulo: 'Dado',
        icone: 'dice-5-outline',
        descricao: 'Toque no botão e o dado "rola": os números trocam rápido por um instante e depois param num valor de 1 a 6.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.Random;

public class MainActivity extends Activity {

    private Handler handler = new Handler();
    private Random sorteio = new Random();
    private TextView numero;
    private int vezes = 0;

    private Runnable passo = new Runnable() {
        @Override
        public void run() {
            numero.setText(String.valueOf(sorteio.nextInt(6) + 1));
            vezes++;
            if (vezes < 10) {
                handler.postDelayed(this, 60);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        numero = new TextView(this);
        numero.setText("?");
        numero.setTextColor(Color.WHITE);
        numero.setTextSize(96);
        numero.setGravity(Gravity.CENTER);

        Button rolar = new Button(this);
        rolar.setText("Rolar dado");
        rolar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                handler.removeCallbacks(passo);
                vezes = 0;
                handler.post(passo);
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(numero);
        raiz.addView(rolar);
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'jogotoque',
        titulo: 'Jogo: pegue o botão',
        icone: 'gamepad-variant-outline',
        descricao: 'Um botão que pula pra um lugar aleatório a cada toque. Faça o máximo de pontos em 10 segundos. Mostra como usar CountDownTimer, posição (setX/setY) e placar.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import java.util.Random;

public class MainActivity extends Activity {

    private FrameLayout raiz;
    private Button alvo;
    private Button iniciar;
    private TextView placar;
    private Random sorteio = new Random();
    private int pontos = 0;
    private long segundosRestantes = 10;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        raiz = new FrameLayout(this);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));

        placar = new TextView(this);
        placar.setTextColor(Color.WHITE);
        placar.setTextSize(20);
        placar.setPadding(30, 30, 30, 30);
        placar.setText("Toque em Começar");
        raiz.addView(placar);

        alvo = new Button(this);
        alvo.setText("TOQUE!");
        alvo.setVisibility(View.GONE);
        alvo.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                pontos++;
                atualizarPlacar();
                mover();
            }
        });
        raiz.addView(alvo, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT));

        iniciar = new Button(this);
        iniciar.setText("Começar");
        iniciar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                comecar();
            }
        });
        raiz.addView(iniciar, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER));

        setContentView(raiz);
    }

    private void comecar() {
        pontos = 0;
        segundosRestantes = 10;
        iniciar.setVisibility(View.GONE);
        alvo.setVisibility(View.VISIBLE);
        atualizarPlacar();
        mover();

        new CountDownTimer(10000, 1000) {
            @Override
            public void onTick(long ms) {
                segundosRestantes = ms / 1000 + 1;
                atualizarPlacar();
            }

            @Override
            public void onFinish() {
                alvo.setVisibility(View.GONE);
                placar.setText("Fim! Você fez " + pontos + " pontos");
                iniciar.setText("Jogar de novo");
                iniciar.setVisibility(View.VISIBLE);
            }
        }.start();
    }

    private void atualizarPlacar() {
        placar.setText("Pontos: " + pontos + "    Tempo: " + segundosRestantes);
    }

    // Leva o botão pra um lugar aleatório (espera ele ter tamanho na tela)
    private void mover() {
        alvo.post(new Runnable() {
            @Override
            public void run() {
                int maxX = Math.max(1, raiz.getWidth() - alvo.getWidth());
                int maxY = Math.max(1, raiz.getHeight() - alvo.getHeight() - 150);
                alvo.setX(sorteio.nextInt(maxX));
                alvo.setY(150 + sorteio.nextInt(maxY));
            }
        });
    }
}`,
        }],
      },
      {
        id: 'conversor',
        titulo: 'Conversor de temperatura',
        icone: 'thermometer',
        descricao: 'Digite graus Celsius e veja o valor em Fahrenheit mudando enquanto você digita (TextWatcher). Dá pra adaptar pra qualquer conversão.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
import android.view.Gravity;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    private TextView resultado;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        EditText campo = new EditText(this);
        campo.setHint("Graus Celsius (°C)");
        campo.setHintTextColor(Color.GRAY);
        campo.setTextColor(Color.WHITE);
        campo.setInputType(InputType.TYPE_CLASS_NUMBER
                | InputType.TYPE_NUMBER_FLAG_DECIMAL
                | InputType.TYPE_NUMBER_FLAG_SIGNED);

        resultado = new TextView(this);
        resultado.setTextColor(Color.WHITE);
        resultado.setTextSize(32);
        resultado.setGravity(Gravity.CENTER);
        resultado.setPadding(0, 50, 0, 0);

        // Roda toda vez que o texto muda
        campo.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int inicio, int depois, int novo) {
            }

            @Override
            public void onTextChanged(CharSequence s, int inicio, int antes, int quanto) {
                converter(s.toString());
            }

            @Override
            public void afterTextChanged(Editable e) {
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(40, 80, 40, 40);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(campo);
        raiz.addView(resultado);
        setContentView(raiz);
    }

    private void converter(String texto) {
        try {
            double celsius = Double.parseDouble(texto);
            double fahrenheit = celsius * 9 / 5 + 32;
            resultado.setText(String.format("%.1f °F", fahrenheit));
        } catch (NumberFormatException e) {
            resultado.setText("");
        }
    }
}`,
        }],
      },
    ],
  },
  // ═══════════════ COMPONENTES DE TELA ═══════════════
  {
    categoria: 'Componentes de tela',
    icone: 'view-dashboard-outline',
    itens: [
      {
        id: 'seekbar',
        titulo: 'Barra deslizante (SeekBar)',
        icone: 'tune-variant',
        descricao: 'Arraste a barra pra mudar o tamanho e a cor do texto na hora. Serve de base pra volume, brilho, zoom e qualquer valor de 0 a 100.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final TextView texto = new TextView(this);
        texto.setText("Arraste a barra");
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(20);
        texto.setGravity(Gravity.CENTER);
        texto.setPadding(0, 0, 0, 60);

        SeekBar barra = new SeekBar(this);
        barra.setMax(100);
        barra.setProgress(20);
        barra.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar s, int valor, boolean pessoa) {
                texto.setTextSize(14 + valor);
                texto.setTextColor(Color.HSVToColor(new float[]{valor * 3.6f, 1f, 1f}));
            }

            @Override
            public void onStartTrackingTouch(SeekBar s) {
            }

            @Override
            public void onStopTrackingTouch(SeekBar s) {
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setPadding(50, 50, 50, 50);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(texto);
        raiz.addView(barra);
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'spinner',
        titulo: 'Lista suspensa (Spinner)',
        icone: 'form-dropdown',
        descricao: 'Menu que abre pra escolher uma opção da lista. Mostra a escolha num texto embaixo.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final String[] frutas = {"Maçã", "Banana", "Uva", "Laranja", "Manga"};

        final TextView escolha = new TextView(this);
        escolha.setTextColor(Color.WHITE);
        escolha.setTextSize(24);
        escolha.setGravity(Gravity.CENTER);
        escolha.setPadding(0, 50, 0, 0);

        ArrayAdapter<String> adaptador = new ArrayAdapter<String>(
                this, android.R.layout.simple_spinner_item, frutas);
        adaptador.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);

        Spinner lista = new Spinner(this);
        lista.setAdapter(adaptador);
        lista.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> pai, View item, int posicao, long id) {
                escolha.setText("Você escolheu: " + frutas[posicao]);
            }

            @Override
            public void onNothingSelected(AdapterView<?> pai) {
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(50, 100, 50, 50);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(lista);
        raiz.addView(escolha);
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'opcoes',
        titulo: 'Caixas e opções (CheckBox e RadioButton)',
        icone: 'checkbox-marked-outline',
        descricao: 'Um grupo de opções onde só dá pra marcar uma (RadioGroup) e uma caixa de marcar sim/não (CheckBox). O botão mostra o que foi escolhido.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.Toast;

public class MainActivity extends Activity {

    private RadioGroup grupo;
    private CheckBox caixa;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        grupo = new RadioGroup(this);
        String[] tamanhos = {"Pequeno", "Médio", "Grande"};
        for (String nome : tamanhos) {
            RadioButton opcao = new RadioButton(this);
            opcao.setId(View.generateViewId());
            opcao.setText(nome);
            opcao.setTextColor(Color.WHITE);
            grupo.addView(opcao);
        }

        caixa = new CheckBox(this);
        caixa.setText("Quero borda recheada");
        caixa.setTextColor(Color.WHITE);

        Button ver = new Button(this);
        ver.setText("Ver minha escolha");
        ver.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                int idMarcado = grupo.getCheckedRadioButtonId();
                if (idMarcado == -1) {
                    Toast.makeText(MainActivity.this, "Escolha um tamanho", Toast.LENGTH_SHORT).show();
                    return;
                }
                RadioButton marcado = (RadioButton) findViewById(idMarcado);
                String msg = marcado.getText() + (caixa.isChecked() ? " com borda" : " sem borda");
                Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show();
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(50, 80, 50, 50);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(grupo);
        raiz.addView(caixa);
        raiz.addView(ver);
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'progresso',
        titulo: 'Barra de progresso',
        icone: 'progress-clock',
        descricao: 'Barra que enche de 0 a 100% sozinha, com a porcentagem escrita. Um botão reinicia. Base pra downloads e carregamentos.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public class MainActivity extends Activity {

    private Handler handler = new Handler();
    private ProgressBar barra;
    private TextView texto;
    private int valor = 0;

    private Runnable avancar = new Runnable() {
        @Override
        public void run() {
            if (valor < 100) {
                valor++;
                barra.setProgress(valor);
                texto.setText(valor + "%");
                handler.postDelayed(this, 40);
            } else {
                texto.setText("Pronto!");
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        texto = new TextView(this);
        texto.setText("0%");
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(30);
        texto.setGravity(Gravity.CENTER);

        barra = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        barra.setMax(100);

        Button reiniciar = new Button(this);
        reiniciar.setText("Reiniciar");
        reiniciar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                handler.removeCallbacks(avancar);
                valor = 0;
                barra.setProgress(0);
                handler.post(avancar);
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setPadding(50, 50, 50, 50);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(texto);
        raiz.addView(barra);
        raiz.addView(reiniciar);
        setContentView(raiz);

        handler.post(avancar);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacks(avancar);
    }
}`,
        }],
      },
      {
        id: 'datahora',
        titulo: 'Escolher data e hora',
        icone: 'calendar-clock',
        descricao: 'Dois botões que abrem o seletor de data e o de hora do Android e mostram o que a pessoa escolheu.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.DatePicker;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.TimePicker;
import java.util.Calendar;

public class MainActivity extends Activity {

    private TextView resultado;
    private String data = "";
    private String hora = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        resultado = new TextView(this);
        resultado.setText("Nada escolhido ainda");
        resultado.setTextColor(Color.WHITE);
        resultado.setTextSize(22);
        resultado.setGravity(Gravity.CENTER);
        resultado.setPadding(0, 50, 0, 0);

        Button botaoData = new Button(this);
        botaoData.setText("Escolher data");
        botaoData.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                escolherData();
            }
        });

        Button botaoHora = new Button(this);
        botaoHora.setText("Escolher hora");
        botaoHora.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                escolherHora();
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setPadding(50, 50, 50, 50);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botaoData);
        raiz.addView(botaoHora);
        raiz.addView(resultado);
        setContentView(raiz);
    }

    private void escolherData() {
        Calendar hoje = Calendar.getInstance();
        new DatePickerDialog(this, new DatePickerDialog.OnDateSetListener() {
            @Override
            public void onDateSet(DatePicker tela, int ano, int mes, int dia) {
                // O mês começa em 0 (janeiro), por isso o +1
                data = dia + "/" + (mes + 1) + "/" + ano;
                mostrar();
            }
        }, hoje.get(Calendar.YEAR), hoje.get(Calendar.MONTH), hoje.get(Calendar.DAY_OF_MONTH)).show();
    }

    private void escolherHora() {
        Calendar agora = Calendar.getInstance();
        new TimePickerDialog(this, new TimePickerDialog.OnTimeSetListener() {
            @Override
            public void onTimeSet(TimePicker tela, int h, int min) {
                hora = String.format("%02d:%02d", h, min);
                mostrar();
            }
        }, agora.get(Calendar.HOUR_OF_DAY), agora.get(Calendar.MINUTE), true).show();
    }

    private void mostrar() {
        resultado.setText("Data: " + data + "\nHora: " + hora);
    }
}`,
        }],
      },
      {
        id: 'desenhar',
        titulo: 'Desenhar com o dedo',
        icone: 'draw',
        descricao: 'Uma tela em branco pra desenhar com o dedo. Tem botão pra trocar a cor e pra limpar. Mostra como criar uma View própria com Canvas e Path.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;

public class MainActivity extends Activity {

    // A tela de desenho: guarda o traço num Path e redesenha a cada movimento
    static class Quadro extends View {
        private final Path caminho = new Path();
        private final Paint tinta = new Paint();

        Quadro(Context contexto) {
            super(contexto);
            tinta.setColor(Color.WHITE);
            tinta.setStyle(Paint.Style.STROKE);
            tinta.setStrokeWidth(8);
            tinta.setStrokeCap(Paint.Cap.ROUND);
            tinta.setStrokeJoin(Paint.Join.ROUND);
            tinta.setAntiAlias(true);
        }

        void trocarCor(int cor) {
            tinta.setColor(cor);
        }

        void limpar() {
            caminho.reset();
            invalidate();
        }

        @Override
        protected void onDraw(Canvas tela) {
            tela.drawPath(caminho, tinta);
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            float x = e.getX();
            float y = e.getY();
            if (e.getAction() == MotionEvent.ACTION_DOWN) {
                caminho.moveTo(x, y);
                return true;
            } else if (e.getAction() == MotionEvent.ACTION_MOVE) {
                caminho.lineTo(x, y);
                invalidate();
                return true;
            }
            return false;
        }
    }

    private int posicaoCor = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final int[] cores = {Color.WHITE, Color.parseColor("#ff2fc6"),
                Color.parseColor("#8fd6ff"), Color.parseColor("#ffd479")};
        final Quadro quadro = new Quadro(this);

        Button cor = new Button(this);
        cor.setText("Trocar cor");
        cor.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                posicaoCor = (posicaoCor + 1) % cores.length;
                quadro.trocarCor(cores[posicaoCor]);
            }
        });

        Button limpar = new Button(this);
        limpar.setText("Limpar");
        limpar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                quadro.limpar();
            }
        });

        LinearLayout botoes = new LinearLayout(this);
        botoes.setOrientation(LinearLayout.HORIZONTAL);
        botoes.addView(cor, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        botoes.addView(limpar, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(botoes);
        raiz.addView(quadro, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(raiz);
    }
}`,
        }],
      },
    ],
  },
  // ═══════════════ INTEGRAÇÃO COM O CELULAR ═══════════════
  {
    categoria: 'Integração com o celular',
    icone: 'connection',
    itens: [
      {
        id: 'ligar',
        titulo: 'Abrir o discador',
        icone: 'phone-outline',
        descricao: 'Digite um número e o botão abre o discador do celular já com ele preenchido. Não precisa de permissão porque quem liga é a própria pessoa.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final EditText numero = new EditText(this);
        numero.setHint("Número de telefone");
        numero.setHintTextColor(Color.GRAY);
        numero.setTextColor(Color.WHITE);
        numero.setInputType(InputType.TYPE_CLASS_PHONE);

        Button ligar = new Button(this);
        ligar.setText("Abrir discador");
        ligar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String n = numero.getText().toString().trim();
                if (n.length() == 0) {
                    Toast.makeText(MainActivity.this, "Digite um número", Toast.LENGTH_SHORT).show();
                    return;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + n)));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "Sem app de telefone", Toast.LENGTH_SHORT).show();
                }
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(50, 100, 50, 50);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(numero);
        raiz.addView(ligar);
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'email',
        titulo: 'Enviar e-mail',
        icone: 'email-outline',
        descricao: 'Preenche destinatário, assunto e mensagem e abre o app de e-mail da pessoa pronto pra enviar. Não precisa de permissão nem de internet no seu app.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

public class MainActivity extends Activity {

    private EditText para;
    private EditText assunto;
    private EditText mensagem;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        para = novoCampo("Para (e-mail)");
        assunto = novoCampo("Assunto");
        mensagem = novoCampo("Mensagem");

        Button enviar = new Button(this);
        enviar.setText("Enviar e-mail");
        enviar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent email = new Intent(Intent.ACTION_SENDTO);
                email.setData(Uri.parse("mailto:" + para.getText().toString().trim()));
                email.putExtra(Intent.EXTRA_SUBJECT, assunto.getText().toString());
                email.putExtra(Intent.EXTRA_TEXT, mensagem.getText().toString());
                try {
                    startActivity(Intent.createChooser(email, "Enviar e-mail com"));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "Sem app de e-mail", Toast.LENGTH_SHORT).show();
                }
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(50, 80, 50, 50);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(para);
        raiz.addView(assunto);
        raiz.addView(mensagem);
        raiz.addView(enviar);
        setContentView(raiz);
    }

    private EditText novoCampo(String dica) {
        EditText c = new EditText(this);
        c.setHint(dica);
        c.setHintTextColor(Color.GRAY);
        c.setTextColor(Color.WHITE);
        return c;
    }
}`,
        }],
      },
      {
        id: 'copiar',
        titulo: 'Copiar e colar',
        icone: 'content-copy',
        descricao: 'Copia o texto digitado pra área de transferência e cola o que estiver copiado de outro app.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final ClipboardManager area =
                (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);

        final EditText campo = new EditText(this);
        campo.setHint("Digite algo");
        campo.setHintTextColor(Color.GRAY);
        campo.setTextColor(Color.WHITE);

        Button copiar = new Button(this);
        copiar.setText("Copiar");
        copiar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                area.setPrimaryClip(ClipData.newPlainText("texto", campo.getText().toString()));
                Toast.makeText(MainActivity.this, "Copiado!", Toast.LENGTH_SHORT).show();
            }
        });

        Button colar = new Button(this);
        colar.setText("Colar");
        colar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (area.hasPrimaryClip() && area.getPrimaryClip().getItemCount() > 0) {
                    CharSequence texto = area.getPrimaryClip().getItemAt(0).coerceToText(MainActivity.this);
                    campo.setText(texto);
                } else {
                    Toast.makeText(MainActivity.this, "Nada copiado", Toast.LENGTH_SHORT).show();
                }
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(50, 80, 50, 50);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(campo);
        raiz.addView(copiar);
        raiz.addView(colar);
        setContentView(raiz);
    }
}`,
        }],
      },
      {
        id: 'bateria',
        titulo: 'Nível da bateria',
        icone: 'battery-70',
        descricao: 'Mostra a porcentagem da bateria e se está carregando, e atualiza sozinho quando muda. Usa um BroadcastReceiver que só fica ligado com o app na tela.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.os.BatteryManager;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

public class MainActivity extends Activity {

    private TextView tela;

    private BroadcastReceiver receptor = new BroadcastReceiver() {
        @Override
        public void onReceive(Context contexto, Intent intent) {
            mostrar(intent);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        tela = new TextView(this);
        tela.setTextColor(Color.WHITE);
        tela.setTextSize(36);
        tela.setGravity(Gravity.CENTER);
        tela.setBackgroundColor(Color.parseColor("#03050a"));
        setContentView(tela);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // O Android entrega o último valor na hora de registrar
        Intent atual = registerReceiver(receptor, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (atual != null) {
            mostrar(atual);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        unregisterReceiver(receptor);
    }

    private void mostrar(Intent intent) {
        int nivel = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int escala = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        int status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
        boolean carregando = status == BatteryManager.BATTERY_STATUS_CHARGING
                || status == BatteryManager.BATTERY_STATUS_FULL;

        int porcento = escala > 0 ? nivel * 100 / escala : 0;
        tela.setText("Bateria: " + porcento + "%\n" + (carregando ? "Carregando" : "Na bateria"));
    }
}`,
        }],
      },
      {
        id: 'rede',
        titulo: 'Está com internet?',
        icone: 'wifi',
        descricao: 'Verifica se o celular está conectado e se é por Wi-Fi ou dados móveis. Útil antes de baixar alguma coisa.',
        blocos: [
          {
            rotulo: 'AndroidManifest.xml — adicione antes de <application>',
            codigo: JAVA`<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />`,
          },
          {
            rotulo: 'MainActivity.java',
            codigo: JAVA`import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    private TextView tela;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        tela = new TextView(this);
        tela.setTextColor(Color.WHITE);
        tela.setTextSize(26);
        tela.setGravity(Gravity.CENTER);

        Button conferir = new Button(this);
        conferir.setText("Verificar de novo");
        conferir.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                verificar();
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(tela);
        raiz.addView(conferir);
        setContentView(raiz);

        verificar();
    }

    private void verificar() {
        ConnectivityManager gerente =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo rede = gerente.getActiveNetworkInfo();

        if (rede != null && rede.isConnected()) {
            tela.setText("Conectado\n(" + rede.getTypeName() + ")");
        } else {
            tela.setText("Sem internet");
        }
    }
}`,
          },
        ],
      },
      {
        id: 'falar',
        titulo: 'Falar o texto (voz)',
        icone: 'text-to-speech',
        descricao: 'Digite uma frase e o celular lê em voz alta, em português do Brasil. Usa o TextToSpeech do Android, sem permissão.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;
import java.util.Locale;

public class MainActivity extends Activity {

    private TextToSpeech voz;
    private boolean pronta = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        voz = new TextToSpeech(this, new TextToSpeech.OnInitListener() {
            @Override
            public void onInit(int status) {
                if (status == TextToSpeech.SUCCESS) {
                    voz.setLanguage(new Locale("pt", "BR"));
                    pronta = true;
                }
            }
        });

        final EditText campo = new EditText(this);
        campo.setText("Olá! Esse app fala.");
        campo.setTextColor(Color.WHITE);

        Button falar = new Button(this);
        falar.setText("Falar");
        falar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (!pronta) {
                    Toast.makeText(MainActivity.this, "A voz ainda não ficou pronta", Toast.LENGTH_SHORT).show();
                    return;
                }
                voz.speak(campo.getText().toString(), TextToSpeech.QUEUE_FLUSH, null, "fala1");
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setPadding(50, 100, 50, 50);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(campo);
        raiz.addView(falar);
        setContentView(raiz);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (voz != null) {
            voz.stop();
            voz.shutdown();
        }
    }
}`,
        }],
      },
      {
        id: 'bussola',
        titulo: 'Bússola',
        icone: 'compass-outline',
        descricao: 'Uma seta que gira apontando pro norte e o ângulo em graus. Combina o acelerômetro com o sensor magnético. Segure o celular na horizontal.',
        blocos: [{
          rotulo: 'MainActivity.java',
          codigo: JAVA`import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity implements SensorEventListener {

    private SensorManager sensores;
    private TextView seta;
    private TextView texto;
    private float[] gravidade = null;
    private float[] campo = null;
    private final String[] pontos = {"N", "NE", "L", "SE", "S", "SO", "O", "NO"};

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        sensores = (SensorManager) getSystemService(Context.SENSOR_SERVICE);

        seta = new TextView(this);
        seta.setText("▲");
        seta.setTextColor(Color.parseColor("#ff2fc6"));
        seta.setTextSize(120);
        seta.setGravity(Gravity.CENTER);

        texto = new TextView(this);
        texto.setTextColor(Color.WHITE);
        texto.setTextSize(28);
        texto.setGravity(Gravity.CENTER);

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(seta);
        raiz.addView(texto);
        setContentView(raiz);
    }

    @Override
    protected void onResume() {
        super.onResume();
        Sensor acelerometro = sensores.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        Sensor magnetico = sensores.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        if (acelerometro == null || magnetico == null) {
            texto.setText("Este celular não tem bússola");
            return;
        }
        sensores.registerListener(this, acelerometro, SensorManager.SENSOR_DELAY_GAME);
        sensores.registerListener(this, magnetico, SensorManager.SENSOR_DELAY_GAME);
    }

    @Override
    protected void onPause() {
        super.onPause();
        sensores.unregisterListener(this);
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        if (e.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
            gravidade = e.values.clone();
        } else if (e.sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) {
            campo = e.values.clone();
        }

        if (gravidade != null && campo != null) {
            float[] matriz = new float[9];
            if (SensorManager.getRotationMatrix(matriz, null, gravidade, campo)) {
                float[] orientacao = new float[3];
                SensorManager.getOrientation(matriz, orientacao);
                float graus = (float) Math.toDegrees(orientacao[0]);
                if (graus < 0) {
                    graus += 360;
                }
                seta.setRotation(-graus);
                int indice = Math.round(graus / 45f) % 8;
                texto.setText(Math.round(graus) + "° " + pontos[indice]);
            }
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int precisao) {
    }
}`,
        }],
      },
      {
        id: 'internet',
        titulo: 'Buscar dados na internet',
        icone: 'cloud-download-outline',
        descricao: 'Ao tocar no botão, o app baixa uma frase de uma API pública e mostra na tela. A chamada roda em outra thread pra não travar o app, e o resultado volta pra tela com runOnUiThread.',
        blocos: [
          {
            rotulo: 'AndroidManifest.xml — adicione antes de <application>',
            codigo: JAVA`<uses-permission android:name="android.permission.INTERNET" />`,
          },
          {
            rotulo: 'MainActivity.java',
            codigo: JAVA`import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private TextView resposta;
    private Button buscar;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        resposta = new TextView(this);
        resposta.setTextColor(Color.WHITE);
        resposta.setTextSize(22);
        resposta.setGravity(Gravity.CENTER);
        resposta.setPadding(40, 0, 40, 40);

        buscar = new Button(this);
        buscar.setText("Buscar frase");
        buscar.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                buscar.setEnabled(false);
                resposta.setText("Buscando...");
                baixar();
            }
        });

        LinearLayout raiz = new LinearLayout(this);
        raiz.setOrientation(LinearLayout.VERTICAL);
        raiz.setGravity(Gravity.CENTER);
        raiz.setBackgroundColor(Color.parseColor("#03050a"));
        raiz.addView(resposta);
        raiz.addView(buscar);
        setContentView(raiz);
    }

    // Internet nunca roda na thread principal: o Android bloqueia
    private void baixar() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                String resultado;
                try {
                    URL url = new URL("https://api.github.com/zen");
                    HttpURLConnection con = (HttpURLConnection) url.openConnection();
                    con.setRequestProperty("User-Agent", "MeuApp");
                    con.setConnectTimeout(8000);
                    con.setReadTimeout(8000);

                    BufferedReader leitor = new BufferedReader(
                            new InputStreamReader(con.getInputStream(), "UTF-8"));
                    StringBuilder texto = new StringBuilder();
                    String linha;
                    while ((linha = leitor.readLine()) != null) {
                        texto.append(linha).append("\n");
                    }
                    leitor.close();
                    con.disconnect();
                    resultado = texto.toString().trim();
                } catch (Exception e) {
                    resultado = "Erro: " + e.getMessage();
                }

                final String mostrar = resultado;
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        resposta.setText(mostrar);
                        buscar.setEnabled(true);
                    }
                });
            }
        }).start();
    }
}`,
          },
        ],
      },
    ],
  },
];

// Tira acento e põe em minúsculas, pra busca achar "calculadora" digitando "calcúladora".
function semAcentoStudio(t) {
  let x = String(t || '').toLowerCase();
  try { x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* sem normalize: segue com acento */ }
  return x;
}

// Copiar pra área de transferência. Usa o expo-clipboard se estiver
// instalado no app; se não estiver, abre o menu de compartilhar do
// Android (de lá a pessoa escolhe "Copiar"). Assim funciona na OTA.
async function copiarTextoStudio(texto) {
  try {
    if (Clipboard && Clipboard.setStringAsync) {
      await Clipboard.setStringAsync(texto);
      return 'copiado';
    }
  } catch (e) { /* cai pro compartilhar */ }
  try {
    await Share.share({ message: texto });
    return 'compartilhado';
  } catch (e) {
    return 'erro';
  }
}

const FONTE_MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const aprenderStyles = StyleSheet.create({
  intro: { color: COLORS.dim, fontSize: 12.5, lineHeight: 18, marginTop: 4, marginBottom: 6 },
  catLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 10 },
  catTitulo: { color: COLORS.ink, fontSize: 14, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  chipAtivo: { backgroundColor: 'rgba(180,60,255,0.20)', borderColor: 'rgba(180,60,255,0.55)' },
  chipTexto: { color: COLORS.dim, fontSize: 11.5, fontWeight: '600' },
  chipTextoAtivo: { color: COLORS.ink, fontWeight: '700' },
  painel: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  painelTitulo: { color: COLORS.ink, fontSize: 15, fontWeight: '800' },
  painelDesc: { color: COLORS.dim, fontSize: 12, lineHeight: 18, marginTop: 6 },
  painelDica: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,122,217,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,217,0.25)',
    color: COLORS.gold,
    fontSize: 11,
    lineHeight: 16,
  },
  blocoCab: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 8 },
  blocoRotulo: { flex: 1, color: COLORS.ink, fontSize: 11, fontWeight: '700' },
  copiarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: COLORS.ember,
  },
  copiarBtnOk: { backgroundColor: COLORS.gold },
  copiarTexto: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  codigoCaixa: {
    borderRadius: 12,
    backgroundColor: '#0a0618',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  codigoTexto: {
    color: '#e2d9f3',
    fontSize: 10.5,
    lineHeight: 16,
    fontFamily: FONTE_MONO,
    padding: 12,
  },
});

const LIMITE_HISTORICO = 500;

// ─────────────────────────────────────────────────────────
// Permissões do app (botão de engrenagem no editor). Cada chave liga/
// desliga uma linha <uses-permission> no AndroidManifest.xml.
// `perigosa` = o Android também exige pedir autorização ao usuário
// dentro do app (o manifest sozinho não basta).
// ─────────────────────────────────────────────────────────
const MANIFEST_PATH_STUDIO = 'app/src/main/AndroidManifest.xml';
const GRADLE_PATH_STUDIO = 'app/build.gradle';

// ---------- Versão do app (versionName + versionCode) ----------
// Fica nos dois lugares: atributos da tag <manifest> e app/build.gradle.
function limparVersaoNome(t) {
  return String(t || '').replace(/[^0-9A-Za-z._+-]/g, '').slice(0, 20) || '1.0';
}
function limparVersaoCodigo(t) {
  const n = parseInt(String(t === undefined || t === null ? '' : t).replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 2100000000) : 1;
}
function lerVersaoProjeto(projeto) {
  const c = (projeto && projeto.conteudos) || {};
  const man = c[MANIFEST_PATH_STUDIO] || '';
  const gr = c[GRADLE_PATH_STUDIO] || '';
  const tag = /<manifest\b[^>]*>/.exec(man);
  const t = tag ? tag[0] : '';
  const mn = /android:versionName="([^"]*)"/.exec(t) || /versionName\s+"([^"]*)"/.exec(gr);
  const mc = /android:versionCode="(\d+)"/.exec(t) || /versionCode\s+(\d+)/.exec(gr);
  return { nome: mn ? limparVersaoNome(mn[1]) : '1.0', codigo: mc ? limparVersaoCodigo(mc[1]) : 1 };
}
// Função pura: devolve o projeto com a versão gravada no manifest e no build.gradle.
function aplicarVersaoNoProjeto(projeto, nomeBruto, codigoBruto) {
  const nome = limparVersaoNome(nomeBruto);
  const codigo = limparVersaoCodigo(codigoBruto);
  const conteudos = { ...projeto.conteudos };
  const man = conteudos[MANIFEST_PATH_STUDIO];
  if (man !== undefined) {
    conteudos[MANIFEST_PATH_STUDIO] = man.replace(/<manifest\b[^>]*>/, (tag) => {
      const limpa = tag
        .replace(/\s+android:versionName="[^"]*"/, '')
        .replace(/\s+android:versionCode="[^"]*"/, '');
      return limpa.replace(/\s*\/?>$/, (fim) => `\n    android:versionCode="${codigo}"\n    android:versionName="${nome}"${fim.trim()}`);
    });
  }
  const gr = conteudos[GRADLE_PATH_STUDIO];
  if (gr !== undefined) {
    conteudos[GRADLE_PATH_STUDIO] = gr
      .replace(/versionCode\s+\d+/, `versionCode ${codigo}`)
      .replace(/versionName\s+"[^"]*"/, `versionName "${nome}"`);
  }
  return { ...projeto, conteudos };
}
const P = (id, nome, desc, icone, grupo, perigosa = false) => ({ id: `android.permission.${id}`, nome, desc, icone, grupo, perigosa });
const PERMISSOES_STUDIO = [
  P('INTERNET', 'Internet', 'Acessar a internet', 'web', 'Rede'),
  P('ACCESS_NETWORK_STATE', 'Estado da rede', 'Saber se está online', 'lan-connect', 'Rede'),
  P('ACCESS_WIFI_STATE', 'Estado do Wi-Fi', 'Ver informações do Wi-Fi', 'wifi', 'Rede'),
  P('CHANGE_WIFI_STATE', 'Alterar Wi-Fi', 'Ligar, desligar e conectar o Wi-Fi', 'wifi-cog', 'Rede'),
  P('ACCESS_COARSE_LOCATION', 'Localização aproximada', 'Onde a pessoa está, com pouca precisão', 'map-marker-outline', 'Localização', true),
  P('ACCESS_FINE_LOCATION', 'Localização precisa', 'GPS com precisão', 'crosshairs-gps', 'Localização', true),
  P('ACCESS_BACKGROUND_LOCATION', 'Localização em segundo plano', 'Continuar usando o GPS com o app fechado', 'map-marker-radius-outline', 'Localização', true),
  P('POST_NOTIFICATIONS', 'Notificações', 'Mostrar notificações (Android 13 ou mais)', 'bell-outline', 'Notificações', true),
  P('VIBRATE', 'Vibração', 'Fazer o celular vibrar', 'vibrate', 'Notificações'),
  P('USE_FULL_SCREEN_INTENT', 'Notificação em tela cheia', 'Abrir tela cheia, tipo alarme ou chamada', 'fullscreen', 'Notificações'),
  P('CAMERA', 'Câmera', 'Tirar fotos e gravar vídeo', 'camera-outline', 'Câmera e áudio', true),
  P('RECORD_AUDIO', 'Microfone', 'Gravar áudio', 'microphone-outline', 'Câmera e áudio', true),
  P('MODIFY_AUDIO_SETTINGS', 'Ajustar áudio', 'Mudar volume e modo de som', 'volume-high', 'Câmera e áudio'),
  P('FLASHLIGHT', 'Lanterna', 'Ligar o flash como lanterna', 'flashlight', 'Câmera e áudio'),
  P('READ_MEDIA_IMAGES', 'Ler fotos', 'Acessar as fotos (Android 13 ou mais)', 'image-multiple-outline', 'Fotos e arquivos', true),
  P('READ_MEDIA_VIDEO', 'Ler vídeos', 'Acessar os vídeos (Android 13 ou mais)', 'video-outline', 'Fotos e arquivos', true),
  P('READ_MEDIA_AUDIO', 'Ler músicas', 'Acessar os áudios (Android 13 ou mais)', 'music-note-outline', 'Fotos e arquivos', true),
  P('READ_EXTERNAL_STORAGE', 'Ler armazenamento', 'Ler arquivos (Android 12 ou menos)', 'folder-outline', 'Fotos e arquivos', true),
  P('WRITE_EXTERNAL_STORAGE', 'Gravar armazenamento', 'Salvar arquivos (Android 9 ou menos)', 'content-save-outline', 'Fotos e arquivos', true),
  P('MANAGE_EXTERNAL_STORAGE', 'Todos os arquivos', 'Acesso total ao armazenamento', 'folder-lock-outline', 'Fotos e arquivos'),
  P('READ_CONTACTS', 'Ler contatos', 'Ver a lista de contatos', 'contacts-outline', 'Contatos e telefone', true),
  P('WRITE_CONTACTS', 'Editar contatos', 'Criar e alterar contatos', 'account-edit-outline', 'Contatos e telefone', true),
  P('READ_PHONE_STATE', 'Estado do telefone', 'Ver chamadas em andamento e operadora', 'cellphone', 'Contatos e telefone', true),
  P('CALL_PHONE', 'Fazer ligações', 'Ligar sem abrir o discador', 'phone-outline', 'Contatos e telefone', true),
  P('READ_CALL_LOG', 'Histórico de ligações', 'Ler as chamadas recentes', 'phone-log-outline', 'Contatos e telefone', true),
  P('READ_CALENDAR', 'Ler calendário', 'Ver os eventos', 'calendar-outline', 'Contatos e telefone', true),
  P('WRITE_CALENDAR', 'Editar calendário', 'Criar e alterar eventos', 'calendar-edit', 'Contatos e telefone', true),
  P('SEND_SMS', 'Enviar SMS', 'Mandar mensagens de texto', 'message-arrow-right-outline', 'Mensagens', true),
  P('READ_SMS', 'Ler SMS', 'Ler as mensagens de texto', 'message-text-outline', 'Mensagens', true),
  P('RECEIVE_SMS', 'Receber SMS', 'Ser avisado quando chega SMS', 'message-badge-outline', 'Mensagens', true),
  P('BLUETOOTH', 'Bluetooth', 'Usar o Bluetooth (Android 11 ou menos)', 'bluetooth', 'Bluetooth e conexão'),
  P('BLUETOOTH_ADMIN', 'Gerenciar Bluetooth', 'Ligar e parear (Android 11 ou menos)', 'bluetooth-settings', 'Bluetooth e conexão'),
  P('BLUETOOTH_CONNECT', 'Conectar por Bluetooth', 'Falar com aparelhos pareados (Android 12 ou mais)', 'bluetooth-connect', 'Bluetooth e conexão', true),
  P('BLUETOOTH_SCAN', 'Procurar Bluetooth', 'Achar aparelhos por perto (Android 12 ou mais)', 'bluetooth-audio', 'Bluetooth e conexão', true),
  P('NFC', 'NFC', 'Ler e usar etiquetas NFC', 'nfc', 'Bluetooth e conexão'),
  P('BODY_SENSORS', 'Sensores do corpo', 'Batimentos e sensores de saúde', 'heart-pulse', 'Sensores', true),
  P('ACTIVITY_RECOGNITION', 'Atividade física', 'Contar passos e reconhecer movimento', 'run', 'Sensores', true),
  P('USE_BIOMETRIC', 'Biometria', 'Pedir digital ou rosto', 'fingerprint', 'Sensores'),
  P('WAKE_LOCK', 'Manter ligado', 'Impedir o celular de dormir', 'lightbulb-on-outline', 'Sistema'),
  P('RECEIVE_BOOT_COMPLETED', 'Iniciar com o celular', 'Rodar algo quando o celular liga', 'restart', 'Sistema'),
  P('FOREGROUND_SERVICE', 'Serviço em primeiro plano', 'Continuar rodando com notificação fixa', 'cog-sync-outline', 'Sistema'),
  P('SYSTEM_ALERT_WINDOW', 'Sobrepor outros apps', 'Desenhar por cima de outros apps', 'layers-outline', 'Sistema'),
  P('REQUEST_INSTALL_PACKAGES', 'Instalar apps', 'Pedir pra instalar APKs', 'download-outline', 'Sistema'),
  P('SCHEDULE_EXACT_ALARM', 'Alarmes exatos', 'Agendar alarmes na hora certa', 'alarm', 'Sistema'),
  P('SET_WALLPAPER', 'Papel de parede', 'Trocar o papel de parede', 'wallpaper', 'Sistema'),
  P('WRITE_SETTINGS', 'Ajustes do sistema', 'Mudar brilho e outros ajustes', 'tune-variant', 'Sistema'),
  P('QUERY_ALL_PACKAGES', 'Ver todos os apps', 'Listar os apps instalados', 'apps', 'Sistema'),
  // ── mais permissões ──
  P('CHANGE_NETWORK_STATE', 'Alterar rede', 'Mudar o estado da conexão de rede', 'lan-pending', 'Rede'),
  P('NEARBY_WIFI_DEVICES', 'Wi-Fi por perto', 'Achar aparelhos Wi-Fi perto (Android 13 ou mais)', 'wifi-marker', 'Rede', true),
  P('ACCESS_NOTIFICATION_POLICY', 'Não perturbe', 'Mudar o modo Não perturbe', 'bell-off-outline', 'Notificações'),
  P('READ_MEDIA_VISUAL_USER_SELECTED', 'Fotos escolhidas', 'Acessar só as fotos que a pessoa escolher (Android 14 ou mais)', 'image-check-outline', 'Fotos e arquivos', true),
  P('ACCESS_MEDIA_LOCATION', 'Local das fotos', 'Ler onde cada foto foi tirada', 'image-marker-outline', 'Fotos e arquivos', true),
  P('ANSWER_PHONE_CALLS', 'Atender ligações', 'Atender chamadas recebidas', 'phone-incoming-outline', 'Contatos e telefone', true),
  P('READ_PHONE_NUMBERS', 'Número do telefone', 'Ler o número da linha', 'phone-classic', 'Contatos e telefone', true),
  P('WRITE_CALL_LOG', 'Editar histórico de ligações', 'Criar e apagar chamadas do histórico', 'phone-log', 'Contatos e telefone', true),
  P('GET_ACCOUNTS', 'Contas do aparelho', 'Ver as contas (Google e outras)', 'account-multiple-outline', 'Contatos e telefone', true),
  P('ADD_VOICEMAIL', 'Correio de voz', 'Adicionar mensagens ao correio de voz', 'voicemail', 'Contatos e telefone', true),
  P('USE_SIP', 'Chamadas pela internet', 'Fazer e receber chamadas SIP', 'phone-voip', 'Contatos e telefone', true),
  P('MANAGE_OWN_CALLS', 'Gerenciar suas chamadas', 'App de chamada próprio', 'phone-settings-outline', 'Contatos e telefone'),
  P('RECEIVE_MMS', 'Receber MMS', 'Ser avisado quando chega MMS', 'message-image-outline', 'Mensagens', true),
  P('RECEIVE_WAP_PUSH', 'Receber WAP push', 'Receber mensagens WAP', 'message-processing-outline', 'Mensagens', true),
  P('BLUETOOTH_ADVERTISE', 'Ficar visível no Bluetooth', 'Ser achado por outros aparelhos (Android 12 ou mais)', 'bluetooth-transfer', 'Bluetooth e conexão', true),
  P('UWB_RANGING', 'Ultra banda larga', 'Medir distância até aparelhos UWB', 'radar', 'Bluetooth e conexão', true),
  P('TRANSMIT_IR', 'Infravermelho', 'Usar o emissor de infravermelho', 'remote', 'Bluetooth e conexão'),
  P('BODY_SENSORS_BACKGROUND', 'Sensores do corpo em segundo plano', 'Ler sensores de saúde com o app fechado', 'heart-flash', 'Sensores', true),
  P('HIGH_SAMPLING_RATE_SENSORS', 'Sensores rápidos', 'Ler sensores em alta frequência', 'speedometer', 'Sensores'),
  P('USE_FINGERPRINT', 'Digital (antigo)', 'Leitor de digital das versões antigas', 'fingerprint', 'Sensores'),
  P('USE_EXACT_ALARM', 'Alarmes exatos (alarme/agenda)', 'Para apps de alarme e calendário', 'alarm-check', 'Sistema'),
  P('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'Ignorar economia de bateria', 'Pedir pra não ser limitado em segundo plano', 'battery-heart-variant', 'Sistema'),
  P('EXPAND_STATUS_BAR', 'Barra de status', 'Abrir e fechar a barra de notificações', 'arrow-expand-vertical', 'Sistema'),
  P('DISABLE_KEYGUARD', 'Bloqueio de tela', 'Desativar o bloqueio de tela', 'lock-open-outline', 'Sistema'),
  P('KILL_BACKGROUND_PROCESSES', 'Fechar apps em segundo plano', 'Encerrar processos de outros apps', 'close-circle-multiple-outline', 'Sistema'),
  P('PACKAGE_USAGE_STATS', 'Uso dos apps', 'Ver quanto tempo cada app foi usado', 'chart-timeline-variant', 'Sistema'),
  P('INSTALL_SHORTCUT', 'Criar atalhos', 'Colocar atalhos na tela inicial', 'link-variant-plus', 'Sistema'),
  P('BROADCAST_STICKY', 'Broadcast fixo', 'Enviar avisos que ficam guardados', 'broadcast', 'Sistema'),
  P('FOREGROUND_SERVICE_LOCATION', 'Serviço: localização', 'Serviço contínuo usando GPS (Android 14 ou mais)', 'map-marker-path', 'Sistema'),
  P('FOREGROUND_SERVICE_CAMERA', 'Serviço: câmera', 'Serviço contínuo usando a câmera (Android 14 ou mais)', 'camera-wireless-outline', 'Sistema'),
  P('FOREGROUND_SERVICE_MICROPHONE', 'Serviço: microfone', 'Serviço contínuo gravando áudio (Android 14 ou mais)', 'microphone-message', 'Sistema'),
  P('FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'Serviço: tocar mídia', 'Tocar música ou vídeo em segundo plano (Android 14 ou mais)', 'play-circle-outline', 'Sistema'),
  P('FOREGROUND_SERVICE_DATA_SYNC', 'Serviço: sincronizar dados', 'Enviar e baixar dados em segundo plano (Android 14 ou mais)', 'sync', 'Sistema'),
  P('FOREGROUND_SERVICE_CONNECTED_DEVICE', 'Serviço: aparelho conectado', 'Falar com aparelhos conectados (Android 14 ou mais)', 'usb-port', 'Sistema'),
  P('FOREGROUND_SERVICE_SPECIAL_USE', 'Serviço: uso especial', 'Outros usos em primeiro plano (Android 14 ou mais)', 'star-cog-outline', 'Sistema'),
  { id: 'com.google.android.gms.permission.AD_ID', nome: 'ID de publicidade', desc: 'Usar o ID de anúncios do Google (Android 13 ou mais)', icone: 'advertisements', grupo: 'Sistema', perigosa: false },
];
const GRUPOS_PERMISSOES_STUDIO = ['Rede', 'Localização', 'Notificações', 'Câmera e áudio', 'Fotos e arquivos', 'Contatos e telefone', 'Mensagens', 'Bluetooth e conexão', 'Sensores', 'Sistema'];

// Troca o conteúdo dos comentários XML por espaços (mantendo as quebras de
// linha), pra a busca ignorar permissões que estão só comentadas e os
// índices continuarem batendo com o texto original.
function mascararComentariosXml(xml) {
  return xml.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
}
const REGEX_TAG_PERMISSAO = /<uses-permission\b[^>]*?(?:\/>|>\s*<\/uses-permission>)/g;
function nomeDaTagPermissao(tag) {
  const n = /android:name\s*=\s*"([^"]*)"/.exec(tag);
  return n ? n[1] : null;
}
// Permissões que estão ATIVAS no manifest (fora de comentário).
function lerPermissoesManifest(xml) {
  const m = mascararComentariosXml(xml);
  const re = new RegExp(REGEX_TAG_PERMISSAO.source, 'g');
  const achadas = new Set();
  let r;
  while ((r = re.exec(m))) {
    const nome = nomeDaTagPermissao(r[0]);
    if (nome) achadas.add(nome);
  }
  return achadas;
}
// Liga: escreve a linha <uses-permission> (junto das outras, ou antes do
// <application> se ainda não tem nenhuma). Não duplica.
function ativarPermissaoManifest(xml, nome) {
  if (lerPermissoesManifest(xml).has(nome)) return xml;
  const m = mascararComentariosXml(xml);
  const linha = `<uses-permission android:name="${nome}" />`;
  const re = new RegExp(REGEX_TAG_PERMISSAO.source, 'g');
  let ultimo = null;
  let r;
  while ((r = re.exec(m))) ultimo = r;
  if (ultimo) {
    const fim = ultimo.index + ultimo[0].length;
    const iniLinha = xml.lastIndexOf('\n', ultimo.index - 1) + 1;
    const indent = /^[ \t]*/.exec(xml.slice(iniLinha, ultimo.index))[0];
    return `${xml.slice(0, fim)}\n${indent}${linha}${xml.slice(fim)}`;
  }
  const app = /<application\b/.exec(m);
  if (app) {
    const iniLinha = xml.lastIndexOf('\n', app.index - 1) + 1;
    return `${xml.slice(0, iniLinha)}    ${linha}\n\n${xml.slice(iniLinha)}`;
  }
  const man = /<manifest\b[^>]*>/.exec(m);
  if (man) {
    const fim = man.index + man[0].length;
    return `${xml.slice(0, fim)}\n    ${linha}\n${xml.slice(fim)}`;
  }
  return xml;
}
// Desliga: apaga só a linha dessa permissão. O arquivo continua lá.
function desativarPermissaoManifest(xml, nome) {
  const m = mascararComentariosXml(xml);
  const re = new RegExp(REGEX_TAG_PERMISSAO.source, 'g');
  const achados = [];
  let r;
  while ((r = re.exec(m))) {
    if (nomeDaTagPermissao(r[0]) === nome) achados.push({ ini: r.index, fim: r.index + r[0].length });
  }
  let saida = xml;
  for (let i = achados.length - 1; i >= 0; i--) {
    let { ini, fim } = achados[i];
    const iniLinha = saida.lastIndexOf('\n', ini - 1) + 1;
    let fimLinha = saida.indexOf('\n', fim);
    if (fimLinha === -1) fimLinha = saida.length;
    const sozinha = /^[ \t]*$/.test(saida.slice(iniLinha, ini)) && /^[ \t\r]*$/.test(saida.slice(fim, fimLinha));
    if (sozinha) {
      ini = iniLinha;
      fim = Math.min(fimLinha + 1, saida.length);
      // tinha linha em branco em cima e embaixo? tira uma, pra não sobrar buraco duplo
      const depois = /^[ \t]*\r?\n/.exec(saida.slice(fim));
      if (depois && /\n[ \t]*\n$/.test(saida.slice(0, ini))) fim += depois[0].length;
    }
    saida = saida.slice(0, ini) + saida.slice(fim);
  }
  return saida;
}

// Linhas que o TextInput carrega de cada vez. Arquivo grande NÃO vai inteiro
// pro TextInput nativo (é isso que travava ao abrir/rolar/digitar): só um
// trecho em volta do que está na tela, e o resto é espaço em branco do
// tamanho certo, igual já era feito com os números e as cores.
const TRECHO_MARGEM_LINHAS = 25;   // chegou perto da borda do trecho → recentra
const TRECHO_FOLGA_LINHAS = 80;    // linhas extras pra cada lado ao recentrar

// Em qual linha (0-based) cai a posição `pos` do texto, sem criar strings.
function linhaDoOffset(linhas, pos) {
  let o = 0;
  for (let i = 0; i < linhas.length; i++) {
    o += linhas[i].length + 1;
    if (pos < o) return i;
  }
  return Math.max(0, linhas.length - 1);
}
function diffTexto(antes, depois) {
  const max = Math.min(antes.length, depois.length);
  let p = 0;
  while (p < max && antes.charCodeAt(p) === depois.charCodeAt(p)) p++;
  let q = 0;
  while (q < max - p && antes.charCodeAt(antes.length - 1 - q) === depois.charCodeAt(depois.length - 1 - q)) q++;
  return { p, removido: antes.slice(p, antes.length - q), inserido: depois.slice(p, depois.length - q) };
}

// ─────────────────────────────────────────────────────────
// Ferramentas do editor: zoom, buscar/substituir, snippets e
// autocompletar, barra de símbolos, ir para linha, erro na linha.
// ─────────────────────────────────────────────────────────
const ZOOM_MIN_EDITOR = 0.7;
const ZOOM_MAX_EDITOR = 2.4;

// Teclas da barra acima do teclado: cada uma insere exatamente o que mostra.
const SIMBOLOS_EDITOR = ['{', '}', '(', ')', ';', '<', '>', '"', '=', '/', '[', ']', '.', ',', "'", '!', '&', '|', '+', '-', '*', '_', ':', '@', '#', '\\', '?', '%', '$'];

// Snippets de Java. "g" = gatilho (o que a pessoa digita pra aparecer na
// barra), "$0" = onde o cursor fica depois de inserir. Só usam o que existe
// no Android puro (Activity, android.widget...), igual ao projeto novo.
const SNIPPETS_JAVA_STUDIO = [
  { g: 'oncreate', nome: 'onCreate', desc: 'Início da tela (Activity)', corpo: `@Override
protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    $0
}` },
  { g: 'onstart', nome: 'onStart', desc: 'Tela ficou visível', corpo: `@Override
protected void onStart() {
    super.onStart();
    $0
}` },
  { g: 'onresume', nome: 'onResume', desc: 'Tela voltou pro primeiro plano', corpo: `@Override
protected void onResume() {
    super.onResume();
    $0
}` },
  { g: 'onpause', nome: 'onPause', desc: 'Tela vai pra segundo plano', corpo: `@Override
protected void onPause() {
    super.onPause();
    $0
}` },
  { g: 'onstop', nome: 'onStop', desc: 'Tela deixou de ser visível', corpo: `@Override
protected void onStop() {
    super.onStop();
    $0
}` },
  { g: 'ondestroy', nome: 'onDestroy', desc: 'Tela vai ser fechada', corpo: `@Override
protected void onDestroy() {
    super.onDestroy();
    $0
}` },
  { g: 'onback', nome: 'onBackPressed', desc: 'Botão voltar do celular', corpo: `@Override
public void onBackPressed() {
    $0
    super.onBackPressed();
}` },
  { g: 'onresult', nome: 'onActivityResult', desc: 'Resultado de outra tela', corpo: `@Override
protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    $0
}` },
  { g: 'onperm', nome: 'onRequestPermissionsResult', desc: 'Resposta do pedido de permissão', corpo: `@Override
public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    $0
}` },
  { g: 'toast', nome: 'Toast', desc: 'Mensagem rápida na tela', corpo: `Toast.makeText(this, "$0", Toast.LENGTH_SHORT).show();` },
  { g: 'toastlong', nome: 'Toast longo', desc: 'Mensagem que dura mais', corpo: `Toast.makeText(this, "$0", Toast.LENGTH_LONG).show();` },
  { g: 'intent', nome: 'Intent (abrir tela)', desc: 'Abre outra Activity', corpo: `Intent intent = new Intent(this, $0.class);
startActivity(intent);` },
  { g: 'intentextra', nome: 'Intent com dado', desc: 'Manda um texto pra outra tela', corpo: `Intent intent = new Intent(this, $0.class);
intent.putExtra("chave", "valor");
startActivity(intent);` },
  { g: 'getextra', nome: 'Receber dado do Intent', desc: 'Lê o texto mandado pela outra tela', corpo: `String valor = getIntent().getStringExtra("$0");` },
  { g: 'intenturl', nome: 'Abrir link', desc: 'Abre um site no navegador', corpo: `Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://$0"));
startActivity(intent);` },
  { g: 'intentshare', nome: 'Compartilhar texto', desc: 'Menu de compartilhar do Android', corpo: `Intent intent = new Intent(Intent.ACTION_SEND);
intent.setType("text/plain");
intent.putExtra(Intent.EXTRA_TEXT, "$0");
startActivity(Intent.createChooser(intent, "Compartilhar"));` },
  { g: 'findview', nome: 'findViewById', desc: 'Pega uma view do layout XML', corpo: `View view = findViewById(R.id.$0);` },
  { g: 'onclick', nome: 'setOnClickListener', desc: 'Ação ao tocar numa view', corpo: `botao.setOnClickListener(new View.OnClickListener() {
    @Override
    public void onClick(View v) {
        $0
    }
});` },
  { g: 'log', nome: 'Log.d', desc: 'Mensagem de depuração', corpo: `Log.d("TAG", "$0");` },
  { g: 'prefsave', nome: 'Salvar preferência', desc: 'SharedPreferences (gravar)', corpo: `SharedPreferences prefs = getSharedPreferences("config", MODE_PRIVATE);
prefs.edit().putString("chave", "$0").apply();` },
  { g: 'prefget', nome: 'Ler preferência', desc: 'SharedPreferences (ler)', corpo: `String valor = getSharedPreferences("config", MODE_PRIVATE).getString("chave", "$0");` },
  { g: 'handler', nome: 'Handler (esperar)', desc: 'Roda algo depois de 1 segundo', corpo: `new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
    @Override
    public void run() {
        $0
    }
}, 1000);` },
  { g: 'thread', nome: 'Thread', desc: 'Roda algo em segundo plano', corpo: `new Thread(new Runnable() {
    @Override
    public void run() {
        $0
    }
}).start();` },
  { g: 'runui', nome: 'runOnUiThread', desc: 'Volta pra thread da tela', corpo: `runOnUiThread(new Runnable() {
    @Override
    public void run() {
        $0
    }
});` },
  { g: 'dialog', nome: 'AlertDialog', desc: 'Janelinha com título e botão', corpo: `new AlertDialog.Builder(this)
    .setTitle("Título")
    .setMessage("$0")
    .setPositiveButton("OK", null)
    .show();` },
  { g: 'vibrar', nome: 'Vibrar', desc: 'Faz o celular vibrar', corpo: `Vibrator vibrador = (Vibrator) getSystemService(VIBRATOR_SERVICE);
vibrador.vibrate(300);$0` },
  { g: 'permissao', nome: 'Pedir permissão', desc: 'Checa e pede uma permissão', corpo: `if (checkSelfPermission(Manifest.permission.$0) != PackageManager.PERMISSION_GRANTED) {
    requestPermissions(new String[]{Manifest.permission.CAMERA}, 1);
}` },
  { g: 'webview', nome: 'WebView', desc: 'Mostra um site dentro do app', corpo: `WebView web = new WebView(this);
web.getSettings().setJavaScriptEnabled(true);
web.loadUrl("https://$0");
setContentView(web);` },
  { g: 'fullscreen', nome: 'Tela cheia', desc: 'Esconde barras do sistema', corpo: `getWindow().getDecorView().setSystemUiVisibility(
    View.SYSTEM_UI_FLAG_FULLSCREEN
    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);$0` },
  { g: 'layout', nome: 'LinearLayout em código', desc: 'Cria a tela sem XML', corpo: `LinearLayout layout = new LinearLayout(this);
layout.setOrientation(LinearLayout.VERTICAL);
layout.setPadding(32, 32, 32, 32);
setContentView(layout);$0` },
  { g: 'textview', nome: 'TextView em código', desc: 'Adiciona um texto no layout', corpo: `TextView texto = new TextView(this);
texto.setText("$0");
layout.addView(texto);` },
  { g: 'button', nome: 'Button em código', desc: 'Adiciona um botão no layout', corpo: `Button botao = new Button(this);
botao.setText("$0");
layout.addView(botao);` },
  { g: 'edittext', nome: 'EditText em código', desc: 'Adiciona um campo de texto', corpo: `EditText campo = new EditText(this);
campo.setHint("$0");
layout.addView(campo);` },
  { g: 'for', nome: 'for', desc: 'Repete N vezes', corpo: `for (int i = 0; i < $0; i++) {
    
}` },
  { g: 'foreach', nome: 'for each', desc: 'Passa por cada item da lista', corpo: `for (String item : $0) {
    
}` },
  { g: 'if', nome: 'if', desc: 'Condição', corpo: `if ($0) {
    
}` },
  { g: 'ifelse', nome: 'if / else', desc: 'Condição com senão', corpo: `if ($0) {
    
} else {
    
}` },
  { g: 'while', nome: 'while', desc: 'Repete enquanto for verdade', corpo: `while ($0) {
    
}` },
  { g: 'switch', nome: 'switch', desc: 'Escolhe entre vários casos', corpo: `switch ($0) {
    case 1:
        break;
    default:
        break;
}` },
  { g: 'try', nome: 'try / catch', desc: 'Captura erro', corpo: `try {
    $0
} catch (Exception e) {
    e.printStackTrace();
}` },
  { g: 'method', nome: 'Método', desc: 'Cria uma função', corpo: `private void $0() {
    
}` },
  { g: 'lista', nome: 'ArrayList', desc: 'Lista de textos', corpo: `ArrayList<String> $0 = new ArrayList<>();` },
  { g: 'mapa', nome: 'HashMap', desc: 'Mapa chave → valor', corpo: `HashMap<String, String> $0 = new HashMap<>();` },
  { g: 'imports', nome: 'Imports básicos', desc: 'Activity, Bundle, View, widget', corpo: `import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.widget.*;$0` },
];

// Snippets de XML (layouts, manifest, values).
const SNIPPETS_XML_STUDIO = [
  { g: 'layout', nome: 'Layout raiz (LinearLayout)', desc: 'Tela completa na vertical', corpo: `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp">

    $0

</LinearLayout>` },
  { g: 'linear', nome: 'LinearLayout', desc: 'Caixa vertical/horizontal', corpo: `<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical">

    $0

</LinearLayout>` },
  { g: 'relative', nome: 'RelativeLayout', desc: 'Posiciona em relação aos outros', corpo: `<RelativeLayout
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    $0

</RelativeLayout>` },
  { g: 'frame', nome: 'FrameLayout', desc: 'Camadas empilhadas', corpo: `<FrameLayout
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    $0

</FrameLayout>` },
  { g: 'scroll', nome: 'ScrollView', desc: 'Conteúdo que rola', corpo: `<ScrollView
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    $0

</ScrollView>` },
  { g: 'textview', nome: 'TextView', desc: 'Texto na tela', corpo: `<TextView
    android:id="@+id/$0"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:text="Texto"
    android:textSize="16sp" />` },
  { g: 'button', nome: 'Button', desc: 'Botão', corpo: `<Button
    android:id="@+id/$0"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:text="Botão" />` },
  { g: 'edittext', nome: 'EditText', desc: 'Campo de digitar', corpo: `<EditText
    android:id="@+id/$0"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:hint="Digite aqui"
    android:inputType="text" />` },
  { g: 'imageview', nome: 'ImageView', desc: 'Imagem', corpo: `<ImageView
    android:id="@+id/$0"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:src="@drawable/ic_launcher" />` },
  { g: 'checkbox', nome: 'CheckBox', desc: 'Caixa de marcar', corpo: `<CheckBox
    android:id="@+id/$0"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:text="Opção" />` },
  { g: 'switch', nome: 'Switch', desc: 'Liga/desliga', corpo: `<Switch
    android:id="@+id/$0"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content"
    android:text="Ativar" />` },
  { g: 'progress', nome: 'ProgressBar', desc: 'Carregando', corpo: `<ProgressBar
    android:id="@+id/$0"
    android:layout_width="wrap_content"
    android:layout_height="wrap_content" />` },
  { g: 'listview', nome: 'ListView', desc: 'Lista', corpo: `<ListView
    android:id="@+id/$0"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />` },
  { g: 'webview', nome: 'WebView', desc: 'Site dentro do app', corpo: `<WebView
    android:id="@+id/$0"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />` },
  { g: 'divider', nome: 'Divisória', desc: 'Linha fina', corpo: `<View
    android:layout_width="match_parent"
    android:layout_height="1dp"
    android:background="#33000000" />$0` },
  { g: 'permission', nome: 'uses-permission', desc: 'Permissão no manifest', corpo: `<uses-permission android:name="android.permission.$0" />` },
  { g: 'internet', nome: 'Permissão de internet', desc: 'android.permission.INTERNET', corpo: `<uses-permission android:name="android.permission.INTERNET" />$0` },
  { g: 'activity', nome: 'activity', desc: 'Declara uma tela no manifest', corpo: `<activity
    android:name=".$0"
    android:exported="false" />` },
  { g: 'service', nome: 'service', desc: 'Declara um serviço', corpo: `<service
    android:name=".$0"
    android:exported="false" />` },
  { g: 'string', nome: 'string', desc: 'Texto em values/strings.xml', corpo: `<string name="$0"></string>` },
  { g: 'color', nome: 'color', desc: 'Cor em values/colors.xml', corpo: `<color name="$0">#FF5227</color>` },
  { g: 'lw', nome: 'layout_width', desc: 'match_parent', corpo: `android:layout_width="match_parent"$0` },
  { g: 'lh', nome: 'layout_height', desc: 'wrap_content', corpo: `android:layout_height="wrap_content"$0` },
  { g: 'id', nome: 'android:id', desc: 'Identificador da view', corpo: `android:id="@+id/$0"` },
  { g: 'text', nome: 'android:text', desc: 'Texto', corpo: `android:text="$0"` },
  { g: 'padding', nome: 'android:padding', desc: 'Espaço interno', corpo: `android:padding="16dp"$0` },
  { g: 'margin', nome: 'android:layout_margin', desc: 'Espaço externo', corpo: `android:layout_margin="8dp"$0` },
  { g: 'gravity', nome: 'android:gravity', desc: 'Alinhamento do conteúdo', corpo: `android:gravity="center"$0` },
  { g: 'weight', nome: 'layout_weight', desc: 'Divide o espaço', corpo: `android:layout_weight="1"$0` },
  { g: 'bg', nome: 'android:background', desc: 'Cor de fundo', corpo: `android:background="#$0"` },
];

// Classes e palavras comuns do Android que o autocompletar também sugere.
const CLASSES_ANDROID_AUTO = [
  'Activity', 'Bundle', 'Intent', 'Toast', 'TextView', 'Button', 'EditText', 'ImageView', 'LinearLayout',
  'RelativeLayout', 'FrameLayout', 'ScrollView', 'ListView', 'ProgressBar', 'WebView', 'View', 'ViewGroup',
  'Context', 'String', 'StringBuilder', 'ArrayList', 'HashMap', 'List', 'Map', 'SharedPreferences', 'Handler',
  'Looper', 'Runnable', 'Thread', 'Log', 'Color', 'Gravity', 'Uri', 'File', 'Environment', 'Exception',
  'Override', 'Integer', 'Double', 'Boolean', 'Math', 'System', 'Object', 'Random', 'Vibrator', 'MediaPlayer',
  'AlertDialog', 'MotionEvent', 'Canvas', 'Paint', 'Bitmap', 'Drawable', 'Typeface', 'TypedValue', 'Window',
  'WindowManager', 'Build', 'Manifest', 'PackageManager', 'LayoutParams', 'OnClickListener', 'Gravity',
  'setContentView', 'findViewById', 'startActivity', 'getSystemService', 'setOnClickListener', 'setText',
  'getText', 'runOnUiThread', 'getApplicationContext', 'getResources', 'getSharedPreferences',
];

function escaparRegexBusca(t) {
  return String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Todas as posições do termo no texto (até `limite`), sem juntar linhas.
function acharOcorrenciasTexto(texto, termo, maiusc, limite = 3000) {
  const saida = [];
  if (!termo || typeof texto !== 'string') return saida;
  const re = new RegExp(escaparRegexBusca(termo), maiusc ? 'g' : 'gi');
  let m;
  while ((m = re.exec(texto)) !== null && saida.length < limite) {
    saida.push({ pos: m.index, len: m[0].length });
    if (m[0].length === 0) re.lastIndex += 1;
  }
  return saida;
}

// Busca no projeto inteiro: por arquivo, com linha e um pedaço da linha.
function buscarNoProjetoStudio(conteudos, termo, maiusc) {
  const arquivos = [];
  let total = 0;
  let truncado = false;
  if (!termo || !conteudos) return { arquivos, total, truncado };
  const re = new RegExp(escaparRegexBusca(termo), maiusc ? 'g' : 'gi');
  const caminhos = Object.keys(conteudos).sort();
  for (let f = 0; f < caminhos.length; f++) {
    const caminho = caminhos[f];
    const texto = conteudos[caminho];
    if (typeof texto !== 'string' || texto.length > 1500000) continue;
    if (arquivos.length >= 150) { truncado = true; break; }
    re.lastIndex = 0;
    let m;
    let n = 0;
    let cursorLinha = 0;
    let linhaNum = 1;
    const itens = [];
    while ((m = re.exec(texto)) !== null) {
      n += 1;
      if (m[0].length === 0) re.lastIndex += 1;
      if (itens.length < 30) {
        let k = texto.indexOf('\n', cursorLinha);
        while (k !== -1 && k < m.index) { linhaNum += 1; cursorLinha = k + 1; k = texto.indexOf('\n', cursorLinha); }
        const iniLinha = m.index > 0 ? texto.lastIndexOf('\n', m.index - 1) + 1 : 0;
        const fimBruto = texto.indexOf('\n', m.index);
        const fimLinha = fimBruto === -1 ? texto.length : fimBruto;
        const preview = texto.slice(iniLinha, Math.min(fimLinha, iniLinha + 160)).trim();
        itens.push({ linha: linhaNum, coluna: m.index - iniLinha, preview });
      }
    }
    if (n > 0) { arquivos.push({ caminho, total: n, itens }); total += n; }
  }
  return { arquivos, total, truncado };
}

function substituirTudoTexto(texto, termo, maiusc, substituto) {
  if (!termo || typeof texto !== 'string') return { novo: texto, n: 0 };
  const re = new RegExp(escaparRegexBusca(termo), maiusc ? 'g' : 'gi');
  let n = 0;
  const novo = texto.replace(re, () => { n += 1; return substituto; });
  return { novo, n };
}

// Palavra (letras/números/_) logo antes do cursor — base do autocompletar.
function palavraAntesDoCursor(texto, pos) {
  let i = Math.min(pos, texto.length);
  while (i > 0) {
    const c = texto.charCodeAt(i - 1);
    if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95) i -= 1;
    else break;
  }
  return { ini: i, palavra: texto.slice(i, Math.min(pos, texto.length)) };
}

function indentacaoDaLinha(texto, pos) {
  const ini = pos > 0 ? texto.lastIndexOf('\n', pos - 1) + 1 : 0;
  const m = /^[ \t]*/.exec(texto.slice(ini, ini + 200));
  return m ? m[0] : '';
}

// Aplica a indentação da linha atual nas linhas de baixo e tira o "$0",
// devolvendo o texto final e onde o cursor deve ficar.
function expandirSnippet(corpo, indent) {
  const comIndent = corpo.split('\n').map((l, i) => (i === 0 || l === '' ? l : indent + l)).join('\n');
  const idx = comIndent.indexOf('$0');
  if (idx === -1) return { texto: comIndent, cursor: comIndent.length };
  return { texto: comIndent.slice(0, idx) + comIndent.slice(idx + 2), cursor: idx };
}

function extrairPalavrasUnicas(texto) {
  const base = texto.length > 400000 ? texto.slice(0, 400000) : texto;
  const re = /[A-Za-z_][A-Za-z0-9_]{3,}/g;
  const conjunto = new Set();
  let m;
  while ((m = re.exec(base)) !== null && conjunto.size < 4000) conjunto.add(m[0]);
  return Array.from(conjunto);
}

// Sugestões da barra do teclado: snippets primeiro, depois palavras-chave /
// classes do Android, depois palavras que já existem no arquivo.
function montarSugestoesEditor(ling, palavra, palavrasArquivo) {
  if (!palavra || palavra.length < 2) return [];
  const p = palavra.toLowerCase();
  const saida = [];
  const vistos = new Set();
  const snippets = ling === 'java' ? SNIPPETS_JAVA_STUDIO : ling === 'xml' ? SNIPPETS_XML_STUDIO : [];
  for (let i = 0; i < snippets.length && saida.length < 6; i++) {
    const s = snippets[i];
    if (s.g.indexOf(p) === 0) {
      saida.push({ tipo: 'snippet', chave: `s:${s.g}`, rotulo: s.g, corpo: s.corpo });
    }
  }
  if (palavra.length >= 3) {
    const fontes = [];
    if (ling && PALAVRAS_CHAVE_POR_LINGUAGEM[ling]) fontes.push(PALAVRAS_CHAVE_POR_LINGUAGEM[ling]);
    if (ling === 'java') fontes.push(CLASSES_ANDROID_AUTO);
    fontes.push(palavrasArquivo || []);
    let adicionadas = 0;
    for (let f = 0; f < fontes.length; f++) {
      let porFonte = 0;
      const lista = fontes[f];
      for (let i = 0; i < lista.length && porFonte < 5 && adicionadas < 10; i++) {
        const w = lista[i];
        if (w === palavra || vistos.has(w) || w.toLowerCase().indexOf(p) !== 0) continue;
        vistos.add(w);
        saida.push({ tipo: 'palavra', chave: `p:${w}`, rotulo: w, texto: w });
        porFonte += 1;
        adicionadas += 1;
      }
    }
  }
  return saida;
}

// ─────────────────────────────────────────────────────────
// Atualização forçada (OTA): toda vez que o app abre (ou volta pro primeiro
// plano) ele pergunta se tem update novo publicado (e repete a cada 5 segundos com o app aberto). Se tiver, bloqueia o app
// com a tela "Atualizar agora" e manda uma notificação. Ao tocar, baixa o
// update e reinicia o app já atualizado. Sem gerar APK novo.
// ─────────────────────────────────────────────────────────
function AtualizacaoForcada() {
  const [pendente, setPendente] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState('');
  const verificandoRef = useRef(false);
  const pendenteRef = useRef(false);

  const verificar = async () => {
    if (!Updates || !Updates.isEnabled || verificandoRef.current || pendenteRef.current) return;
    verificandoRef.current = true;
    try {
      const r = await Updates.checkForUpdateAsync();
      if (r && r.isAvailable) {
        pendenteRef.current = true;
        setPendente(true);
      }
    } catch (e) {
      // sem internet: não bloqueia
    } finally {
      verificandoRef.current = false;
    }
  };

  useEffect(() => {
    verificar();
    const sub = AppState.addEventListener('change', (estadoApp) => {
      if (estadoApp === 'active') verificar();
    });
    const rel = setInterval(verificar, 5000);
    // também pega o caso do update já ter sido baixado sozinho em segundo plano
    // (disponível ou pendente): bloqueia do mesmo jeito.
    let ouvinte = null;
    if (Updates && typeof Updates.addUpdatesStateChangeListener === 'function') {
      try {
        ouvinte = Updates.addUpdatesStateChangeListener((ev) => {
          const c = ev && ev.context;
          if (c && (c.isUpdateAvailable || c.isUpdatePending) && !pendenteRef.current) {
            pendenteRef.current = true;
            setPendente(true);
          }
        });
      } catch (e) { ouvinte = null; }
    }
    return () => {
      sub.remove();
      clearInterval(rel);
      if (ouvinte && ouvinte.remove) ouvinte.remove();
    };
  }, []);

  // pop-up pedindo pra atualizar (além da tela de bloqueio)
  useEffect(() => {
    if (!pendente) return;
    Alert.alert(
      'Atualização disponível',
      'Tem uma versão nova do Cindra Studio. Toque em Atualizar para continuar.',
      [{ text: 'Atualizar', onPress: () => { atualizar(); } }],
      { cancelable: false }
    );
  }, [pendente]);

  // enquanto tiver atualização pendente, o botão voltar não fecha o bloqueio
  useEffect(() => {
    if (!pendente) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [pendente]);

  const atualizar = async () => {
    if (baixando) return;
    setErro('');
    setBaixando(true);
    try {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch (e) {
      setErro('Não foi possível atualizar agora. Confira a internet e tente de novo.');
      setBaixando(false);
    }
  };

  if (!pendente) return null;
  return (
    <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
      <View style={{ width: 84, height: 84, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
        <Grad />
        <MaterialCommunityIcons name="cellphone-arrow-down" size={42} color="#ffffff" />
      </View>
      <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Atualização obrigatória</Text>
      <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 10 }}>
        Tem uma versão nova do Cindra Studio. Atualize para continuar usando o app.
      </Text>
      {!!erro && (
        <Text style={{ color: COLORS.error, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 14 }}>{erro}</Text>
      )}
      <TouchableOpacity
        onPress={atualizar}
        disabled={baixando}
        activeOpacity={0.85}
        style={{ alignSelf: 'stretch', height: 52, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 24, opacity: baixando ? 0.7 : 1 }}
      >
        <Grad />
        <Text style={{ color: '#ffffff', fontSize: 15.5, fontWeight: '800' }}>
          {baixando ? 'Atualizando...' : 'Atualizar agora'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────
// BLOQUEIO DE VERSÃO
// Pergunta ao servidor (/api/versao) qual a versão mínima aceita. Se o APK
// instalado for mais antigo, mostra pop-up + tela cheia mandando baixar a
// versão nova em https://cindra-studio.shop. Sem internet: não bloqueia.
// ─────────────────────────────────────────────────────────
const LINK_NOVA_VERSAO = 'https://cindra-studio.shop';
function BloqueioVersao() {
  const [bloqueado, setBloqueado] = useState(false);
  const [msgExtra, setMsgExtra] = useState('');
  const verificandoRef = useRef(false);
  const bloqueadoRef = useRef(false);

  const verificar = async () => {
    if (verificandoRef.current || bloqueadoRef.current) return;
    verificandoRef.current = true;
    try {
      const r = await nuvemFetch('/api/versao', { timeoutMs: 10000 });
      if (r.ok && r.dados) {
        const minimo = Number(r.dados.minimo) || 0;
        if (minimo > 0 && versaoCodigoDoApk() < minimo) {
          bloqueadoRef.current = true;
          setMsgExtra(typeof r.dados.mensagem === 'string' ? r.dados.mensagem : '');
          setBloqueado(true);
        }
      }
    } catch (e) {
      // sem internet: não bloqueia
    } finally {
      verificandoRef.current = false;
    }
  };

  useEffect(() => {
    verificar();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') verificar(); });
    return () => sub.remove();
  }, []);

  const abrirSite = async () => {
    try {
      await Linking.openURL(LINK_NOVA_VERSAO);
    } catch (e) {
      exibirAviso('Não foi possível abrir', `Abra no navegador: ${LINK_NOVA_VERSAO}`, 'erro');
    }
  };

  // pop-up escrito "baixe a nova versão"
  useEffect(() => {
    if (!bloqueado) return;
    Alert.alert(
      'Baixe a nova versão',
      'Esta versão do Cindra Studio não é mais aceita. Baixe a nova versão no site cindra-studio.shop para continuar.',
      [{ text: 'Baixar agora', onPress: () => { abrirSite(); } }],
      { cancelable: false }
    );
  }, [bloqueado]);

  // botão voltar não fecha o bloqueio
  useEffect(() => {
    if (!bloqueado) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [bloqueado]);

  if (!bloqueado) return null;
  return (
    <View style={{ ...StyleSheet.absoluteFillObject, zIndex: 10000, elevation: 10000, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
      <View style={{ width: 84, height: 84, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
        <Grad />
        <MaterialCommunityIcons name="cellphone-arrow-down" size={42} color="#ffffff" />
      </View>
      <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Baixe a nova versão</Text>
      <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 10 }}>
        Esta versão do Cindra Studio não é mais aceita. Baixe a nova versão no site cindra-studio.shop para continuar usando o app.
      </Text>
      {!!msgExtra && (
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginTop: 12 }}>{msgExtra}</Text>
      )}
      <TouchableOpacity
        onPress={abrirSite}
        activeOpacity={0.85}
        style={{ alignSelf: 'stretch', height: 52, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 24 }}
      >
        <Grad />
        <Text style={{ color: '#ffffff', fontSize: 15.5, fontWeight: '800' }}>Baixar nova versão</Text>
      </TouchableOpacity>
      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, textAlign: 'center', marginTop: 12 }}>cindra-studio.shop</Text>
    </View>
  );
}

// Botão flutuante do WhatsApp (suporte): abre a conversa direto no WhatsApp.
const WHATS_SUPORTE = '5531983974632';
const WHATS_MENSAGEM = 'Olá! Preciso de suporte no Cindra Studio.';
function BotaoWhatsFlutuante({ bottom }) {
  const abrir = async () => {
    const texto = encodeURIComponent(WHATS_MENSAGEM);
    try {
      await Linking.openURL(`whatsapp://send?phone=${WHATS_SUPORTE}&text=${texto}`);
    } catch (e) {
      try {
        await Linking.openURL(`https://wa.me/${WHATS_SUPORTE}?text=${texto}`);
      } catch (e2) {
        exibirAviso('WhatsApp', 'Não consegui abrir o WhatsApp. Chame o suporte no número +55 31 98397-4632.', 'aviso');
      }
    }
  };
  return (
    <TouchableOpacity
      onPress={abrir}
      activeOpacity={0.85}
      style={{
        position: 'absolute',
        right: 16,
        bottom,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#25D366',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 8,
        shadowColor: '#25D366',
        shadowOpacity: 0.5,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      <MaterialCommunityIcons name="whatsapp" size={32} color="#ffffff" />
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────
// Avisos do servidor: o painel admin publica, o app mostra o card no topo E
// uma notificação na barra do celular.
// App aberto (ou ainda vivo em segundo plano) → consulta /api/avisos a cada
// 30 s e ao voltar pro app. App fechado → push (precisa do expo-notifications
// + FCM; sem isso o aviso aparece quando o app for aberto).
// ─────────────────────────────────────────────────────────
const ARQUIVO_AVISOS_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_avisos.json`;

async function lerEstadoAvisosStudio() {
  try {
    const info = await FileSystem.getInfoAsync(ARQUIVO_AVISOS_STUDIO);
    if (!info.exists) return null;
    const obj = JSON.parse(await FileSystem.readAsStringAsync(ARQUIVO_AVISOS_STUDIO, { encoding: FileSystem.EncodingType.UTF8 }));
    return obj && typeof obj === 'object' ? obj : null;
  } catch (e) {
    return null;
  }
}

async function gravarEstadoAvisosStudio(estado) {
  try {
    await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}cindrastudio/`, { intermediates: true });
    await FileSystem.writeAsStringAsync(ARQUIVO_AVISOS_STUDIO, JSON.stringify(estado), { encoding: FileSystem.EncodingType.UTF8 });
  } catch (e) {}
}

let notifPreparadasStudio = false;

// Canal + permissão + regra de exibição. Devolve true se pode notificar.
async function prepararNotificacoesStudio() {
  if (!Notifications || Platform.OS !== 'android') return false;
  try {
    if (!notifPreparadasStudio) {
      // Push que chega com o app aberto fica quieto (o card + a notificação
      // local já cobrem); a notificação local do app aparece mesmo aberto.
      Notifications.setNotificationHandler({
        handleNotification: async (n) => {
          const d = (n && n.request && n.request.content && n.request.content.data) || {};
          const mostrar = !!d.local;
          return { shouldShowAlert: mostrar, shouldShowBanner: mostrar, shouldShowList: mostrar, shouldPlaySound: mostrar, shouldSetBadge: false };
        },
      });
      if (Notifications.setNotificationChannelAsync) {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Avisos',
          importance: Notifications.AndroidImportance ? Notifications.AndroidImportance.MAX : 4,
          sound: 'default',
        });
      }
      if (Notifications.setNotificationChannelAsync) {
        await Notifications.setNotificationChannelAsync('avisos', {
          name: 'Avisos do Cindra Studio',
          importance: Notifications.AndroidImportance ? Notifications.AndroidImportance.MAX : 4,
          sound: 'default',
          enableLights: true,
          lightColor: '#C026D3',
          enableVibrate: true,
          vibrationPattern: [0, 250, 150, 250],
        });
      }
      if (Notifications.setNotificationCategoryAsync) {
        await Notifications.setNotificationCategoryAsync('aviso', [
          { identifier: 'abrir', buttonTitle: 'Abrir app', options: { opensAppToForeground: true } },
        ]);
      }
      notifPreparadasStudio = true;
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    return status === 'granted';
  } catch (e) {
    return false;
  }
}

// Põe o aviso na barra de notificações do celular.
async function notificarNaBarraStudio(aviso) {
  if (!Notifications || Platform.OS !== 'android') return;
  try {
    if (!(await prepararNotificacoesStudio())) return;
    // se o push desse aviso já está na barra, não duplica
    if (Notifications.getPresentedNotificationsAsync) {
      const ativas = await Notifications.getPresentedNotificationsAsync();
      const jaTem = (ativas || []).some((x) => {
        const d = x && x.request && x.request.content && x.request.content.data;
        return d && Number(d.avisoId) === Number(aviso.id);
      });
      if (jaTem) return;
    }
    const content = {
      title: String(aviso.titulo || 'Aviso'),
      body: String(aviso.mensagem || ''),
      sound: 'default',
      color: '#C026D3',
      categoryIdentifier: 'aviso',
      priority: Notifications.AndroidNotificationPriority ? Notifications.AndroidNotificationPriority.MAX : 'max',
      vibrate: [0, 250, 150, 250],
      data: { local: true, avisoId: aviso.id },
    };
    try {
      await Notifications.scheduleNotificationAsync({ content, trigger: { channelId: 'avisos' } });
    } catch (e) {
      await Notifications.scheduleNotificationAsync({ content, trigger: null });
    }
  } catch (e) {}
}

function AvisosDoServidor() {
  const verificandoRef = useRef(false);

  useEffect(() => {
    let vivo = true;

    const verificar = async () => {
      if (verificandoRef.current) return;
      verificandoRef.current = true;
      try {
        const estado = (await lerEstadoAvisosStudio()) || {};
        const ultimo = typeof estado.ultimo === 'number' ? estado.ultimo : null;
        const r = await nuvemFetch(`/api/avisos?desde=${ultimo == null ? 0 : ultimo}`, { timeoutMs: 10000 });
        if (!r.ok || !r.dados) return;
        const topo = Number(r.dados.ultimoId) || 0;
        const novos = Array.isArray(r.dados.avisos) ? r.dados.avisos : [];
        // primeira vez neste aparelho: só marca o ponto, não despeja avisos velhos
        if (ultimo == null) { await gravarEstadoAvisosStudio({ ...estado, ultimo: topo }); return; }
        if (!novos.length) return;
        await gravarEstadoAvisosStudio({ ...estado, ultimo: topo });
        novos.slice(-3).forEach((a, i) => {
          notificarNaBarraStudio(a);
          setTimeout(() => {
            if (vivo) exibirAviso(String(a.titulo || 'Aviso'), String(a.mensagem || ''), 'aviso');
          }, i * 4800);
        });
      } catch (e) {
        // sem internet: tenta de novo no próximo ciclo
      } finally {
        verificandoRef.current = false;
      }
    };

    const registrarPush = async () => {
      if (!Notifications || Platform.OS !== 'android') return;
      try {
        if (!(await prepararNotificacoesStudio())) return;
        const estado = (await lerEstadoAvisosStudio()) || {};
        if (estado.push) return; // já registrado neste aparelho
        const t = await Notifications.getExpoPushTokenAsync();
        if (!t || !t.data) return;
        const r = await nuvemFetch('/api/push/registrar', { metodo: 'POST', corpo: { token: t.data }, timeoutMs: 10000 });
        if (r.ok) {
          const atual = (await lerEstadoAvisosStudio()) || {};
          await gravarEstadoAvisosStudio({ ...atual, push: t.data });
        }
      } catch (e) {
        // sem FCM/projectId configurado: segue só com o aviso dentro do app
      }
    };

    prepararNotificacoesStudio();
    verificar();
    registrarPush();
    const rel = setInterval(verificar, 30000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') verificar(); });
    return () => {
      vivo = false;
      clearInterval(rel);
      if (sub && sub.remove) sub.remove();
    };
  }, []);

  return null;
}

function CindraStudioScreen({ visible, onClose }) {
  const insets = useSafeAreaInsets();

  const [etapa, setEtapa] = useState('home'); // 'home' | 'config' | 'workspace'
  const [nomeApp, setNomeApp] = useState('Meu App');
  const [nomePacote, setNomePacote] = useState('com.dev.meuapp');
  const [iconeEscolhido, setIconeEscolhido] = useState(ICONES_APP_STUDIO[0]);
  const [corIcone, setCorIcone] = useState(CORES_ICONE_STUDIO[0]);
  const [fotoIcone, setFotoIcone] = useState(null); // uri do PNG do ícone (foto da galeria), ou null = robozinho
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const [editorFotoUri, setEditorFotoUri] = useState(null);
  const [criandoProjeto, setCriandoProjeto] = useState(false);
  const [campoFoco, setCampoFoco] = useState(null); // 'nome' | 'pacote' | 'versao' | 'codigo'
  const [versaoNomeNovo, setVersaoNomeNovo] = useState('1.0'); // versão do app novo (tela de criação)
  const [versaoCodigoNovo, setVersaoCodigoNovo] = useState('1');

  // Tela inicial: lista de projetos já criados (resumo — nome, pacote,
  // ícone, cor). O conteúdo completo de cada um só é lido quando a
  // pessoa toca pra abrir.
  const [listaProjetos, setListaProjetos] = useState([]);
  const [cardProjeto, setCardProjeto] = useState(null); // projeto segurado (card de ação)
  const [buscaProjeto, setBuscaProjeto] = useState('');
  const [buscaAberta, setBuscaAberta] = useState(false); // lupa do topo → vira barra de busca
  const [filtroProjetos, setFiltroProjetos] = useState('todos'); // 'todos' | 'favoritos' | 'semana'
  const [ordenacao, setOrdenacao] = useState('recentes'); // 'recentes' | 'antigos' | 'nome' | 'nomeDesc'
  const [favoritosNoTopo, setFavoritosNoTopo] = useState(true);
  const [modoLista, setModoLista] = useState('lista'); // 'lista' | 'grade'
  const [menuOrdenarAberto, setMenuOrdenarAberto] = useState(false); // folha "Ordenar por"
  const [builds, setBuilds] = useState([]); // histórico de APKs gerados (aba "Gerados")
  const [gruposAbertos, setGruposAbertos] = useState({}); // { [pacote]: true } — setinha expandida
  const [confirmarApagarBuild, setConfirmarApagarBuild] = useState(null); // id do build com "apagar?" armado
  const [confirmarApagarGrupo, setConfirmarApagarGrupo] = useState(null); // pacote com "apagar todos?" armado
  const [modoSelecaoBuilds, setModoSelecaoBuilds] = useState(false); // seleção múltipla na aba Gerados
  const [selecionadosBuilds, setSelecionadosBuilds] = useState({}); // { [idBuild]: true }
  const [confirmarApagarLote, setConfirmarApagarLote] = useState(false);
  const [copiandoPublica, setCopiandoPublica] = useState(false); // copiando APKs pra /storage/emulated/0/cindra-studio
  const avisoPastaPublicaRef = useRef(false); // avisa da permissão só 1 vez por sessão
  const [pedirAcessoArquivos, setPedirAcessoArquivos] = useState(false); // folha "Liberar acesso aos arquivos" ao abrir o app
  const [verificandoAcessoArquivos, setVerificandoAcessoArquivos] = useState(false); // spinner do botão "verificar de novo"
  const semAcessoPublicoRef = useRef(false); // última checagem: sem permissão pra cindra-studio
  const pedidoRecusadoRef = useRef(false); // "Agora não" (vale até fechar o app)
  const buildsRef = useRef([]);
  buildsRef.current = builds;
  const [abaHome, setAbaHome] = useState('apps'); // barra de baixo da tela inicial: 'apps' | 'gerados' | 'aprender'
  const abaAnteriorRef = useRef('apps');
  const trocouAba = abaAnteriorRef.current !== abaHome;
  useEffect(() => { abaAnteriorRef.current = abaHome; }, [abaHome]);
  const [exemploAberto, setExemploAberto] = useState(null); // id do exemplo aberto na aba Aprender
  const [buscaAprender, setBuscaAprender] = useState('');
  const [buscaAprenderAberta, setBuscaAprenderAberta] = useState(false); // lupa da aba Aprender
  const [copiadoChave, setCopiadoChave] = useState(null); // bloco que acabou de ser copiado (mostra "Copiado!")
  const [confirmarSaida, setConfirmarSaida] = useState(false); // folha "Sair do app?" (botão voltar na tela inicial)
  const [avisoRecuperarVisivel, setAvisoRecuperarVisivel] = useState(false); // só depois de ler as prefs
  const prefsRef = useRef({});

  const [projeto, setProjeto] = useState(null); // { arvore, conteudos, arquivoInicial }
  const [pastasAbertas, setPastasAbertas] = useState({});
  const [abasAbertas, setAbasAbertas] = useState([]); // array de caminhos
  const [arquivoAtivo, setArquivoAtivo] = useState(null);
  const [sidebarAberta, setSidebarAberta] = useState(false);
  const historicoRef = useRef({}); // { [caminho]: { undo: [], redo: [] } }
  const conteudoAtivoRef = useRef(''); // texto mais recente do arquivo ativo (síncrono, antes do re-render)
  const [selecaoForcada, setSelecaoForcada] = useState(null); // posiciona o cursor depois de desfazer/refazer
  // alturaTeclado = quanto do teclado REALMENTE cobre a tela do app (medido pela
  // borda de cima do teclado, não só pela altura que o Android informa — em
  // edge-to-edge essa altura não conta a barra de navegação e a barra de
  // símbolos ficava escondida atrás do teclado). tecladoVisivel = teclado aberto.
  const [alturaTeclado, setAlturaTeclado] = useState(0);
  const [tecladoVisivel, setTecladoVisivel] = useState(false);
  const caixaEditorRef = useRef(null);
  const tecladoInfoRef = useRef(null);
  const recalcularTecladoRef = useRef(() => {});
  recalcularTecladoRef.current = () => {
    const info = tecladoInfoRef.current;
    if (!info) return;
    const caixa = caixaEditorRef.current;
    if (caixa && caixa.measureInWindow && info.screenY !== null) {
      caixa.measureInWindow((x, y, w, alt) => {
        const atual = tecladoInfoRef.current;
        if (!atual) return;
        const sobra = Math.round(y + alt - atual.screenY);
        // medida maluca (NaN, negativa demais ou maior que o teclado+barra) → cai pra altura informada
        if (!isFinite(sobra)) { setAlturaTeclado(atual.h); return; }
        setAlturaTeclado(Math.max(0, Math.min(sobra, atual.h + 160)));
      });
    } else {
      setAlturaTeclado(info.h);
    }
  };
  const [caretPos, setCaretPos] = useState(0); // posição do cursor no texto (pra rolar até ele)
  const scrollEditorRef = useRef(null);
  const scrollYEditorRef = useRef(0);
  const alturaAreaEditorRef = useRef(0);
  const [larguraVisivelCodigo, setLarguraVisivelCodigo] = useState(0); // largura da área do código (sem a coluna de números)
  // ---- Ferramentas do editor (zoom, buscar/substituir, snippets, símbolos) ----
  const [zoomEditor, setZoomEditor] = useState(1); // zoom do código (1 = 100%)
  const zoomRef = useRef(1);
  const [pinchAtivo, setPinchAtivo] = useState(false); // dois dedos na tela: trava a rolagem enquanto dá zoom
  const pinchRef = useRef({ ativo: false, d0: 1, z0: 1 });
  const [zoomVisivel, setZoomVisivel] = useState(false); // selinho "130%" que some sozinho
  const zoomTimerRef = useRef(null);
  const [editorFocado, setEditorFocado] = useState(false); // teclado do código aberto → mostra a barra de símbolos
  const selecaoRef = useRef({ start: 0, end: 0 }); // seleção no texto INTEIRO (não no trecho)
  const scrollHorizRef = useRef(null);
  const linhasAtivasRef = useRef(['']);
  const alturaLinhaRef = useRef(20);
  const irPendenteRef = useRef(null); // { arquivo, linha, coluna }: ir pra linha depois de abrir o arquivo
  const [barraEditor, setBarraEditor] = useState(null); // null | 'buscar' | 'linha'
  const [consultaEditor, setConsultaEditor] = useState('');
  const [substituirTexto, setSubstituirTexto] = useState('');
  const [mostrarSubstituir, setMostrarSubstituir] = useState(false);
  const [buscaMaiusc, setBuscaMaiusc] = useState(false); // diferenciar maiúscula/minúscula
  const [buscaEscopo, setBuscaEscopo] = useState('arquivo'); // 'arquivo' | 'projeto'
  const [buscaIdx, setBuscaIdx] = useState(0);
  const [resultadosProjeto, setResultadosProjeto] = useState(null);
  const [confirmarSubst, setConfirmarSubst] = useState(false); // "substituir em tudo" pede um segundo toque
  const [linhaDigitada, setLinhaDigitada] = useState('');
  const [destaqueLinha, setDestaqueLinha] = useState(-1); // linha piscando depois de "ir para"
  const destaqueTimerRef = useRef(null);
  const destaqueAnim = useRef(new Animated.Value(0)).current; // fade do destaque da linha (sem liga/desliga seco)
  const caretTimerRef = useRef(null);
  const [snippetsAberto, setSnippetsAberto] = useState(false);
  const [filtroSnippet, setFiltroSnippet] = useState('');
  const [erroIdx, setErroIdx] = useState(0);
  const [marcasErroOcultas, setMarcasErroOcultas] = useState(false);
  const palavrasCacheRef = useRef({ arquivo: null, t: 0, lista: [] });
  // "Janela" de linhas realmente desenhadas (números + destaque de sintaxe).
  // Em vez de criar um <Text> pra cada linha do arquivo inteiro (pesado em
  // arquivo grande), só desenha as linhas perto do que está visível na tela
  // — o resto vira espaço em branco do tamanho certo, então a rolagem não
  // "pula" nada.
  const janelaStoreRef = useRef(null);
  if (!janelaStoreRef.current) janelaStoreRef.current = criarStoreJanela({ inicio: 0, fim: 120 });
  const setJanelaEditor = useCallback((n) => janelaStoreRef.current.set(n), []);
  const ultimoYJanelaRef = useRef(0);
  const alturaLinhaAnteriorRef = useRef(null);
  const trechoTimerRef = useRef(null);
  // Trecho (em linhas) que está de fato dentro do TextInput.
  const [trecho, setTrecho] = useState({ ini: 0, fim: 150 });
  const trechoInfoRef = useRef({ ini: 0, fim: 1, offset: 0, tamanho: 0, quebras: 0, total: 1 });
  const ignorarSelecaoAteRef = useRef(0); // ignora seleção "fantasma" logo após trocar o trecho
  const primeiraTrocaTrechoRef = useRef(true);
  const [menuProjetoAberto, setMenuProjetoAberto] = useState(false); // folha "Opções do projeto" (fora do menu lateral)

  // Compilação (▶)
  const [compilando, setCompilando] = useState(false);
  const [painelCompilacao, setPainelCompilacao] = useState(false);
  // Popup do código secreto (tira a marca d'água) — aparece ao tocar em compilar.
  const [popupCodigo, setPopupCodigo] = useState(false);
  const [codigoDigitado, setCodigoDigitado] = useState('');
  const [erroCodigo, setErroCodigo] = useState('');
  const modoPendenteRef = useRef('debug');
  const [logCompilacao, setLogCompilacao] = useState([]);
  const [errosCompilacao, setErrosCompilacao] = useState([]);
  const [apkGerado, setApkGerado] = useState(null);
  // Assinatura do APK: debug (chave interna) ou release (keystore do usuário).
  // As senhas ficam só na memória; keystore (cópia no app) + alias ficam salvos.
  const [folhaBuildAberta, setFolhaBuildAberta] = useState(false);
  const [tipoBuild, setTipoBuild] = useState('debug'); // 'debug' | 'release'
  const [keystoreInfo, setKeystoreInfo] = useState(null); // { nome, caminho }
  const [aliasKeystore, setAliasKeystore] = useState('');
  const [senhaKeystore, setSenhaKeystore] = useState('');
  const [senhaChave, setSenhaChave] = useState('');
  // Progresso animado do stepper (0 a 6) + pulso do ícone central do painel.
  const progressoCompilacao = useRef(new Animated.Value(0)).current;
  const pulsoCompilacao = useRef(new Animated.Value(1)).current;

  // Persistência: o projeto (arquivos, abas, nome, ícone) fica salvo em
  // disco e volta sozinho na próxima vez que abrir a tela — mesmo depois de
  // fechar o app. Só começa do zero se a pessoa tocar em "Novo projeto".
  const [estadoCarregado, setEstadoCarregado] = useState(false);
  const [confirmandoNovo, setConfirmandoNovo] = useState(false);
  const [permissoesAberto, setPermissoesAberto] = useState(false); // folha de permissões (engrenagem do editor)
  const [buscaPermissao, setBuscaPermissao] = useState('');
  const { height: alturaTela, width: larguraTela } = useWindowDimensions();
  const [cardNo, setCardNo] = useState(null); // pasta/arquivo segurado (card de ação)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(null); // caminho do arquivo aguardando o 2º toque pra excluir
  const [pastaEmCriacao, setPastaEmCriacao] = useState(false); // dentro do card: mostrando o campo de nome da nova pasta
  const [nomeNovaPasta, setNomeNovaPasta] = useState('');
  const estadoRef = useRef(null);

  // Lê as preferências da tela inicial (aviso de recuperação dispensado ou não).
  useEffect(() => {
    let vivo = true;
    lerPrefsStudio().then((prefs) => {
      if (!vivo) return;
      prefsRef.current = prefs;
      MARCA_REMOVIDA_STUDIO = prefs.marcaRemovida === true;
      setAvisoRecuperarVisivel(!prefs.avisoRecuperarDispensado);
      if (prefs.modoLista === 'grade' || prefs.modoLista === 'lista') setModoLista(prefs.modoLista);
      if (Object.prototype.hasOwnProperty.call(ROTULOS_ORDEM_STUDIO, prefs.ordenacao)) setOrdenacao(prefs.ordenacao);
      if (typeof prefs.favoritosNoTopo === 'boolean') setFavoritosNoTopo(prefs.favoritosNoTopo);
      if (prefs.keystore && prefs.keystore.caminho) {
        // só reaproveita se a cópia do keystore ainda existe no aparelho
        FileSystem.getInfoAsync(prefs.keystore.caminho).then((info) => {
          if (vivo && info.exists) setKeystoreInfo({ nome: prefs.keystore.nome, caminho: prefs.keystore.caminho });
        }).catch(() => {});
      }
      if (typeof prefs.aliasKeystore === 'string') setAliasKeystore(prefs.aliasKeystore);
      if (prefs.tipoBuild === 'release' || prefs.tipoBuild === 'debug') setTipoBuild(prefs.tipoBuild);
      if (typeof prefs.zoomEditor === 'number' && prefs.zoomEditor >= ZOOM_MIN_EDITOR && prefs.zoomEditor <= ZOOM_MAX_EDITOR) {
        zoomRef.current = prefs.zoomEditor;
        setZoomEditor(prefs.zoomEditor);
      }
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
    // Histórico de APKs: lê o registro e já inclui os APKs que estão
    // guardados no celular de antes da aba existir.
    (async () => {
      const registrados = await lerBuildsStudio();
      const projetos = await lerListaProjetosStudio();
      const importados = await importarApksExistentesStudio(registrados, projetos);
      const { lista: completo, mudou } = await completarIconesBuildsStudio(importados, projetos);
      if (mudou || importados.length !== registrados.length) gravarBuildsStudio(completo).catch(() => {});
      if (vivo) setBuilds(completo);
      // Se a permissão já está liberada, manda pra pasta cindra-studio o que
      // ainda não foi (em silêncio; sem permissão simplesmente não faz nada).
      const sync = await copiarPendentesPastaPublicaStudio(completo);
      if (sync.copiados > 0) {
        gravarBuildsStudio(sync.lista).catch(() => {});
        if (vivo) setBuilds(sync.lista);
      }
    })().catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Foto do estado atual (só existe depois de carregar e com projeto criado).
  estadoRef.current = estadoCarregado && projeto
    ? { versao: 1, nomeApp, nomePacote, iconeEscolhido, corIcone, fotoIcone, projeto, pastasAbertas, abasAbertas, arquivoAtivo }
    : null;

  // Salva sozinho, 4 s depois da última mudança (digitar, abrir aba, criar
  // projeto...). Antes era 0,5 s: o JSON.stringify do projeto INTEIRO rodava
  // na mesma thread da digitação a cada pausinha e travava a próxima letra.
  // Ao ir pro segundo plano ele salva na hora (efeito logo abaixo).
  useEffect(() => {
    if (!estadoRef.current) return undefined;
    const t = setTimeout(() => {
      if (estadoRef.current) gravarEstadoStudio(estadoRef.current).then(() => marcarSeMudouNuvem()).catch(() => {});
    }, 4000);
    return () => clearTimeout(t);
  }, [estadoCarregado, projeto, pastasAbertas, abasAbertas, arquivoAtivo, nomeApp, nomePacote, iconeEscolhido, corIcone, fotoIcone]);

  // Salva na hora quando o app vai pra segundo plano (não perde nada se o
  // sistema matar o app logo em seguida).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estadoApp) => {
      if (estadoApp !== 'active' && estadoRef.current) {
        gravarEstadoStudio(estadoRef.current).then(() => marcarSeMudouNuvem()).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Ao abrir o app: confere o acesso à pasta cindra-studio. Sem acesso,
  // sobe a folha pedindo pra liberar.
  useEffect(() => {
    if (visible && estadoCarregado) verificarAcessoPastaPublica(true);
  }, [visible, estadoCarregado]);

  // Voltou das configurações do Android? Confere de novo; se liberou, já
  // manda os APKs que faltam pra pasta. Tenta mais de uma vez com um
  // pequeno atraso: em alguns aparelhos o AppState já marca "active" antes
  // do Android terminar de aplicar o MANAGE_EXTERNAL_STORAGE, então a
  // primeira checagem logo ao voltar ainda vê "sem permissão".
  useEffect(() => {
    let cancelado = false;
    const sub = AppState.addEventListener('change', (estadoApp) => {
      if (estadoApp !== 'active' || !semAcessoPublicoRef.current) return;
      const tentar = async (restantes) => {
        if (cancelado) return;
        await liberouAcessoPastaPublica();
        if (!cancelado && semAcessoPublicoRef.current && restantes > 0) {
          setTimeout(() => tentar(restantes - 1), 700);
        }
      };
      setTimeout(() => tentar(3), 400);
    });
    return () => { cancelado = true; sub.remove(); };
  }, []);

  // ── Pasta cindra-studio/NomeApp/arquivos (espelho do projeto) ──
  // importar=true: antes de espelhar, traz pro app o que foi alterado,
  // apagado, renomeado ou adicionado por fora. Devolve o projeto já atualizado.
  const sincronizandoRef = useRef(false);
  const importouRef = useRef('');
  const sincronizarPastaApp = async (importar, projIn, nomeAppIn) => {
    const est = estadoRef.current;
    let proj = projIn || (est && est.projeto);
    const nomeDoApp = nomeAppIn || (est && est.nomeApp);
    if (!proj || !proj.pacote || sincronizandoRef.current) return null;
    sincronizandoRef.current = true;
    try {
      if (importar || importouRef.current !== proj.pacote) {
        const d = await lerAlteracoesDaPastaStudio(proj, nomeDoApp);
        importouRef.current = proj.pacote;
        if (d) {
          proj = aplicarAlteracoesDaPastaStudio(proj, d);
          setProjeto((atual) => (atual && atual.pacote === proj.pacote ? aplicarAlteracoesDaPastaStudio(atual, d) : atual));
          const mexidos = Object.keys(d.textos).concat(Object.keys(d.binarios), d.removidos);
          mexidos.forEach((c) => { delete historicoRef.current[c]; });
          if (d.removidos.length) {
            setAbasAbertas((a) => a.filter((c) => !d.removidos.includes(c)));
            setArquivoAtivo((a) => (a && d.removidos.includes(a) ? null : a));
          }
          exibirAviso('Alterações da pasta', `${mexidos.length} ${mexidos.length === 1 ? 'arquivo atualizado' : 'arquivos atualizados'} a partir de cindra-studio/${nomePastaAppStudio(nomeDoApp, proj.pacote)}/arquivos`, 'sucesso');
        }
      }
      await espelharProjetoNaPastaStudio(proj, nomeDoApp);
      return proj;
    } catch (e) {
      return null;
    } finally {
      sincronizandoRef.current = false;
    }
  };

  // Depois de mexer no projeto (1,5 s parado), atualiza a pasta arquivos.
  useEffect(() => {
    if (etapa !== 'workspace' || !projeto) return undefined;
    const t = setTimeout(() => { sincronizarPastaApp(false).catch(() => {}); }, 6000);
    return () => clearTimeout(t);
  }, [projeto, nomeApp, etapa]);

  // Voltou pro Studio (ex.: veio do gerenciador de arquivos): traz o que
  // mudou na pasta. Foi pro segundo plano: grava o que falta na pasta.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estadoApp) => {
      if (!estadoRef.current) return;
      if (estadoApp === 'active') {
        setTimeout(() => { sincronizarPastaApp(true).catch(() => {}); }, 600);
      } else {
        sincronizarPastaApp(false).catch(() => {});
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
    if (!sidebarAberta) { setCardNo(null); }
  }, [sidebarAberta]);

  useEffect(() => {
    if (!menuProjetoAberto) { setConfirmandoNovo(false); }
  }, [menuProjetoAberto]);

  // Stepper do painel de compilação: acha a etapa mais avançada citada no
  // log ("N/6 ...") e anima a barra até lá. Quando o APK sai pronto, força
  // as 6 etapas preenchidas (o "6/6" às vezes nem aparece no log nativo).
  const progressoLog = useMemo(() => {
    for (let i = logCompilacao.length - 1; i >= 0; i -= 1) {
      const pr = lerLinhaProgresso(logCompilacao[i]);
      if (pr) return pr;
    }
    return { etapa: 0, valor: 0 };
  }, [logCompilacao]);

  const etapaCompilacaoAtual = useMemo(() => {
    if (apkGerado) return STEPS_COMPILACAO.length;
    return progressoLog.etapa;
  }, [progressoLog, apkGerado]);

  const logAmigavel = useMemo(() => montarLogAmigavel(logCompilacao), [logCompilacao]);

  useEffect(() => {
    Animated.timing(progressoCompilacao, {
      toValue: apkGerado ? STEPS_COMPILACAO.length : progressoLog.valor,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // anima largura (%), não dá pra usar o driver nativo
    }).start();
  }, [progressoLog, apkGerado]);

  useEffect(() => {
    if (!painelCompilacao) { pulsoCompilacao.setValue(1); return undefined; }
    if (!compilando) { pulsoCompilacao.setValue(1); return undefined; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulsoCompilacao, { toValue: 1.14, duration: 620, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulsoCompilacao, { toValue: 1, duration: 620, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [painelCompilacao, compilando]);

  // "Excluir projeto" (dentro do workspace): apaga o projeto atual de vez
  // e volta pra tela inicial (lista de projetos).
  const novoProjeto = () => {
    const antigo = projeto;
    const pacoteAntigo = nomePacote;
    setConfirmandoNovo(false);
    setSidebarAberta(false);
    setMenuProjetoAberto(false);
    setProjeto(null);
    setAbasAbertas([]);
    setArquivoAtivo(null);
    setPastasAbertas({});
    setPainelCompilacao(false);
    setLogCompilacao([]);
    setErrosCompilacao([]);
    setApkGerado(null);
    FileSystem.deleteAsync(caminhoEstadoProjeto(pacoteAntigo), { idempotent: true }).catch(() => {});
    if (fotoIcone) FileSystem.deleteAsync(fotoIcone, { idempotent: true }).catch(() => {});
    setFotoIcone(null);
    if (antigo && antigo.pacote) {
      FileSystem.deleteAsync(pastaProjetoStudio(antigo.pacote), { idempotent: true }).catch(() => {});
      FileSystem.deleteAsync(pastaBinariosStudio(antigo.pacote), { idempotent: true }).catch(() => {});
    }
    registrarExclusaoNuvem(pacoteAntigo).then(() => { lerNuvemStudio().then((n) => { nuvemRef.current = n; }); agendarSyncNuvem(1000); });
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
    setVersaoNomeNovo('1.0');
    setVersaoCodigoNovo('1');
    setIconeEscolhido(ICONES_APP_STUDIO[0]);
    setCorIcone(CORES_ICONE_STUDIO[0]);
    setFotoIcone(null);
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
    setFotoIcone(e.fotoIcone || null);
    let proj = e.projeto;
    if (!proj.binarios) proj = { ...proj, binarios: {} };
    if (!arvoreTemCaminho(proj.arvore, ASSETS_STUDIO)) {
      proj = {
        ...proj,
        arvore: inserirNoNaArvore(proj.arvore, 'app/src/main', { nome: 'assets', caminho: ASSETS_STUDIO, tipo: 'pasta', filhos: [] }),
      };
    }
    setProjeto(proj);
    projetoMarcadoRef.current = proj;
    setPastasAbertas(e.pastasAbertas || {});
    setAbasAbertas(Array.isArray(e.abasAbertas) ? e.abasAbertas.filter(existe) : []);
    setArquivoAtivo(e.arquivoAtivo && existe(e.arquivoAtivo) ? e.arquivoAtivo : null);
    setPainelCompilacao(false);
    setApkGerado(null);
    setErrosCompilacao([]);
    setLogCompilacao([]);
    setEtapa('workspace');
    importouRef.current = '';
    sincronizarPastaApp(true, proj, e.nomeApp || 'Meu App').catch(() => {});
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

  // Tela inicial → card do projeto → "Versão": lê/grava direto no estado salvo
  // do projeto (sem precisar abrir o app).
  const lerVersaoDaLista = async (pacote) => {
    const e = await lerEstadoStudio(pacote);
    return e && e.projeto ? lerVersaoProjeto(e.projeto) : { nome: '1.0', codigo: 1 };
  };
  const salvarVersaoDaLista = async (pacote, nome, codigo) => {
    try {
      const e = await lerEstadoStudio(pacote);
      if (!e || !e.projeto) {
        exibirAviso('Não deu pra salvar', 'Não achei o projeto salvo.', 'erro');
        return false;
      }
      const proj = aplicarVersaoNoProjeto(e.projeto, nome, codigo);
      await gravarEstadoStudio({ ...e, projeto: proj });
      const v = lerVersaoProjeto(proj);
      const lista = await atualizarListaProjetosStudio({ pacote, versaoNome: v.nome, versaoCodigo: v.codigo });
      setListaProjetos(lista);
      return true;
    } catch (err) {
      exibirAviso(TITULO_MANUTENCAO, MSG_MANUTENCAO, 'erro');
      return false;
    }
  };

  // Tela inicial: segurar o dedo num projeto abre o card com a opção de
  // excluir (sem precisar entrar no projeto pra apagar).
  const excluirProjetoDaLista = (pacote) => {
    setCardProjeto(null);
    const itemLista = listaProjetos.find((p) => p.pacote === pacote);
    if (itemLista && itemLista.fotoIcone) FileSystem.deleteAsync(itemLista.fotoIcone, { idempotent: true }).catch(() => {});
    FileSystem.deleteAsync(caminhoEstadoProjeto(pacote), { idempotent: true }).catch(() => {});
    FileSystem.deleteAsync(pastaProjetoStudio(pacote), { idempotent: true }).catch(() => {});
    FileSystem.deleteAsync(pastaBinariosStudio(pacote), { idempotent: true }).catch(() => {});
    removerDaListaProjetosStudio(pacote).then(setListaProjetos).catch(() => {});
    registrarExclusaoNuvem(pacote).then(() => { lerNuvemStudio().then((n) => { nuvemRef.current = n; }); agendarSyncNuvem(1000); });
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
        fotoIcone: fotoIcone || null,
        versaoNome: lerVersaoProjeto(estadoRef.current.projeto).nome,
        versaoCodigo: lerVersaoProjeto(estadoRef.current.projeto).codigo,
      }).catch(() => null);
      if (lista) setListaProjetos(lista);
      marcarSeMudouNuvem();
      agendarSyncNuvem(2500);
    }
    await sincronizarPastaApp(false).catch(() => {});
    importouRef.current = '';
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
    setPastaEmCriacao(false);
    setNomeNovaPasta('');
    setConfirmandoExclusao(null);
    // Pasta OU qualquer arquivo (código, texto, binário) abre o card de ação.
    setCardNo(no);
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

      // nome seguro pro Android (sem espaço/acento). Se já existe um arquivo
      // com esse MESMO nome na pasta, ele é SUBSTITUÍDO (sem criar cópia
      // tipo npc_2.fxb) — vale pra qualquer tipo de arquivo.
      const limpo = String(arq.name || 'arquivo').replace(/[^A-Za-z0-9._-]/g, '_');
      const ponto = limpo.lastIndexOf('.');
      const raiz = ponto > 0 ? limpo.slice(0, ponto) : limpo;
      const ext = ponto > 0 ? limpo.slice(ponto) : '';
      let nome = limpo;
      let n = 2;
      // Único caso em que o nome muda: já existe uma PASTA com esse nome.
      let noExistente = acharNoNaArvore(projeto.arvore, `${pastaCaminho}/${nome}`);
      while (noExistente && noExistente.tipo === 'pasta') {
        nome = `${raiz}_${n}${ext}`; n += 1;
        noExistente = acharNoNaArvore(projeto.arvore, `${pastaCaminho}/${nome}`);
      }

      // Detecção do tipo: extensão conhecida de texto → texto; extensão
      // conhecida binária → binário; qualquer outra → espia o conteúdo.
      const eTexto = ehExtensaoTexto(nome)
        ? true
        : ehExtensaoBinaria(nome) ? false : await pareceTextoPorConteudo(arq.uri);
      const tipoArq = descreverArquivoStudio(nome, eTexto);

      const caminho = `${pastaCaminho}/${nome}`;
      const eraTexto = projeto.conteudos[caminho] !== undefined;
      const eraBinario = !!(projeto.binarios && projeto.binarios[caminho]);
      const substituindo = !!noExistente || eraTexto || eraBinario;
      const arvoreComNo = (arvore) => (arvoreTemCaminho(arvore, caminho)
        ? arvore
        : inserirNoNaArvore(arvore, pastaCaminho, { nome, caminho, tipo: 'arquivo' }));

      // O histórico de desfazer do arquivo antigo não vale mais pro novo.
      delete historicoRef.current[caminho];

      // Extensão de texto/código → lê o conteúdo direto (sem limite de
      // tamanho) e guarda em `conteudos`, pra abrir editável no Studio.
      // Qualquer outra extensão continua indo pra `binarios` como antes.
      if (eTexto) {
        const texto = await FileSystem.readAsStringAsync(arq.uri, { encoding: FileSystem.EncodingType.UTF8 });
        FileSystem.deleteAsync(arq.uri, { idempotent: true }).catch(() => {}); // limpa o cache
        // Se antes era binário nesse caminho, apaga o binário velho do disco.
        if (eraBinario) FileSystem.deleteAsync(pastaBinariosStudio(projeto.pacote) + caminho, { idempotent: true }).catch(() => {});

        setProjeto((atual) => {
          const bin = { ...(atual.binarios || {}) };
          delete bin[caminho];
          return {
            ...atual,
            arvore: arvoreComNo(atual.arvore),
            conteudos: { ...atual.conteudos, [caminho]: texto },
            binarios: bin,
          };
        });
      } else {
        const destino = pastaBinariosStudio(projeto.pacote) + caminho;
        await FileSystem.makeDirectoryAsync(destino.split('/').slice(0, -1).join('/'), { intermediates: true });
        // Apaga o arquivo antigo antes de copiar (copyAsync não sobrescreve).
        await FileSystem.deleteAsync(destino, { idempotent: true });
        await FileSystem.copyAsync({ from: arq.uri, to: destino });
        FileSystem.deleteAsync(arq.uri, { idempotent: true }).catch(() => {}); // limpa o cache
        const info = await FileSystem.getInfoAsync(destino);
        // Se antes era texto aberto numa aba, fecha a aba (agora é binário).
        if (eraTexto && abasAbertas.includes(caminho)) fecharAba(caminho);

        setProjeto((atual) => {
          const conteudos = { ...atual.conteudos };
          delete conteudos[caminho];
          return {
            ...atual,
            arvore: arvoreComNo(atual.arvore),
            conteudos,
            binarios: { ...(atual.binarios || {}), [caminho]: { tamanho: info.size || 0 } },
          };
        });
      }
      setPastasAbertas((atual) => ({ ...atual, [pastaCaminho]: true }));
      const tam = arq.size ? ` · ${formatarTamanhoStudio(arq.size)}` : '';
      exibirAviso(
        substituindo ? 'Arquivo substituído' : 'Arquivo adicionado',
        `${nome} (${tipoArq.texto}${tam}) está em ${pastaCaminho}`,
        'sucesso'
      );
    } catch (e) {
      exibirAviso(TITULO_MANUTENCAO, MSG_MANUTENCAO, 'erro');
    }
  };

  // Cria uma pasta vazia dentro da pasta segurada. Pastas vazias só existem
  // na árvore em memória (não tem arquivo, então não tem o que gravar em
  // disco ainda) — assim que o usuário adicionar/criar um arquivo lá dentro,
  // ela materializa normal (gravarProjetoStudio já cria o diretório junto).
  const criarPasta = (pastaCaminhoPai, nomeDigitado) => {
    if (!projeto) return;
    const limpo = String(nomeDigitado || '').trim().replace(/[^A-Za-z0-9._-]/g, '_');
    if (!limpo) return;

    let nome = limpo;
    let novoCaminho = `${pastaCaminhoPai}/${nome}`;
    let n = 2;
    while (arvoreTemCaminho(projeto.arvore, novoCaminho)) {
      nome = `${limpo}_${n}`;
      novoCaminho = `${pastaCaminhoPai}/${nome}`;
      n += 1;
    }

    setProjeto((atual) => ({
      ...atual,
      arvore: inserirNoNaArvore(atual.arvore, pastaCaminhoPai, { nome, caminho: novoCaminho, tipo: 'pasta', filhos: [] }),
    }));
    setPastasAbertas((atual) => ({ ...atual, [pastaCaminhoPai]: true, [novoCaminho]: true }));
    setPastaEmCriacao(false);
    setNomeNovaPasta('');
    setCardNo(null);
    exibirAviso('Pasta criada', `${nome} está em ${pastaCaminhoPai}`, 'sucesso');
  };

  // Exclui QUALQUER arquivo do projeto (código como MainActivity.java,
  // texto ou binário): tira da árvore, do conteúdo, do disco e das abas.
  const excluirArquivo = (caminho) => {
    setCardNo(null);
    setConfirmandoExclusao(null);
    if (!projeto) return;
    if (projeto.binarios && projeto.binarios[caminho]) {
      FileSystem.deleteAsync(pastaBinariosStudio(projeto.pacote) + caminho, { idempotent: true }).catch(() => {});
    }
    if (abasAbertas.includes(caminho)) fecharAba(caminho);
    else if (arquivoAtivo === caminho) setArquivoAtivo(null);
    delete historicoRef.current[caminho];
    setProjeto((atual) => {
      const bin = { ...(atual.binarios || {}) };
      delete bin[caminho];
      const conteudos = { ...atual.conteudos };
      delete conteudos[caminho];
      return { ...atual, arvore: removerNoDaArvore(atual.arvore, caminho), conteudos, binarios: bin };
    });
    exibirAviso('Arquivo excluído', caminho.split('/').pop(), 'sucesso');
  };

  // Galeria → editor próprio (cortar, zoom, girar, espelhar) → PNG até 512px.
  // Foto grande no ícone pesa no APK e trava o launcher, então reduz no editor.
  const escolherFotoIcone = async () => {
    if (processandoFoto) return;
    if (!ImagePicker || !ImageManipulator) {
      exibirAviso(
        'Faltam pacotes',
        'Pra usar foto no ícone instale expo-image-picker e expo-image-manipulator (npx expo install ...) e gere um build novo.',
        'erro'
      );
      return;
    }
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType ? ['images'] : ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });
      if (r.canceled || !r.assets || !r.assets.length) return;
      setEditorFotoUri(r.assets[0].uri);
    } catch (e) {
      exibirAviso(TITULO_MANUTENCAO, MSG_MANUTENCAO, 'erro');
    }
  };

  const criarProjeto = async () => {
    if (criandoProjeto) return;
    setCriandoProjeto(true);
    const app = nomeApp.trim() || 'Meu App';
    const pkg = nomePacote.trim() || 'com.dev.meuapp';
    const montar = (comFoto) => aplicarVersaoNoProjeto(montarProjetoNovo(app, pkg, corIcone, comFoto), versaoNomeNovo, versaoCodigoNovo);
    let novo = montar(!!fotoIcone);
    let fotoFinal = null;

    // Foto: vira o ic_launcher.png do projeto (guardado em _bin/, de onde
    // gravarProjetoStudio copia pro lugar certo) e ganha uma cópia própria
    // pros cards da lista. Se algo falhar, cai no ícone padrão.
    if (fotoIcone) {
      try {
        const destinoBin = pastaBinariosStudio(novo.pacote) + ICONE_FOTO_CAMINHO;
        await FileSystem.makeDirectoryAsync(destinoBin.split('/').slice(0, -1).join('/'), { intermediates: true });
        await FileSystem.deleteAsync(destinoBin, { idempotent: true });
        await FileSystem.copyAsync({ from: fotoIcone, to: destinoBin });
        const info = await FileSystem.getInfoAsync(destinoBin);
        novo.binarios[ICONE_FOTO_CAMINHO] = { tamanho: info.size || 0 };

        await FileSystem.makeDirectoryAsync(PASTA_ICONES_STUDIO, { intermediates: true });
        fotoFinal = `${PASTA_ICONES_STUDIO}${novo.pacote}_${Date.now()}.png`;
        await FileSystem.copyAsync({ from: destinoBin, to: fotoFinal });
      } catch (e) {
        novo = montar(false);
        fotoFinal = null;
        exibirAviso('Foto não aplicada', 'Não consegui gravar a foto no projeto — usei o ícone padrão.', 'aviso');
      }
    }

    setFotoIcone(fotoFinal);
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
      fotoIcone: fotoFinal,
      versaoNome: lerVersaoProjeto(novo).nome,
      versaoCodigo: lerVersaoProjeto(novo).codigo,
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
    setCriandoProjeto(false);
    setEtapa('workspace');
  };

  // Recalcula quais linhas devem ser desenhadas, a partir de onde a rolagem
  // está e da altura visível da área do editor. "overscan" (linhas extras
  // pra cada lado) evita que apareça um flash em branco ao rolar rápido.
  // Só atualiza o estado quando a janela realmente muda de posição, pra não
  // gerar um re-render a cada pixel de rolagem.
  const OVERSCAN_LINHAS_EDITOR = 40;
  const BORDA_JANELA_EDITOR = 15; // chegou a menos disso da borda da janela → move a janela
  const atualizarJanelaEditor = useCallback(function atualizar(offsetY, alturaVisivel, alturaLinha) {
    const alt = alturaLinha || 20;
    const y = offsetY || 0;
    const linha = Math.max(0, Math.floor(y / alt));
    const linhasNaTela = Math.ceil((alturaVisivel || 700) / alt);
    const base = linha + linhasNaTela;
    const dy = y - ultimoYJanelaRef.current;
    ultimoYJanelaRef.current = y;
    const info = trechoInfoRef.current;

    // Trecho do TextInput (só importa pra tocar/digitar): durante um arrasto
    // rápido NÃO troca o texto do input a cada passo — espera a rolagem
    // assentar (140ms parado) e recentra uma vez só.
    if (
      (linha - info.ini < TRECHO_MARGEM_LINHAS && info.ini > 0) ||
      (info.fim - base < TRECHO_MARGEM_LINHAS && info.fim < info.total)
    ) {
      if (Math.abs(dy) > alt * 1.5) {
        clearTimeout(trechoTimerRef.current);
        trechoTimerRef.current = setTimeout(() => {
          atualizar(scrollYEditorRef.current, alturaAreaEditorRef.current, alturaLinhaRef.current);
        }, 140);
      } else {
        clearTimeout(trechoTimerRef.current);
        ignorarSelecaoAteRef.current = Date.now() + 250;
        setTrecho({ ini: Math.max(0, linha - TRECHO_FOLGA_LINHAS), fim: base + TRECHO_FOLGA_LINHAS });
      }
    }

    // Janela de linhas desenhadas: só mexe quando a tela chega perto da
    // borda, e quando mexe já leva linhas a mais pro lado pra onde a
    // rolagem está indo (rápido = mais linhas à frente) — nunca fica em branco.
    const atual = janelaStoreRef.current.get();
    const seguroTopo = atual.inicio === 0 || linha - atual.inicio >= BORDA_JANELA_EDITOR;
    const seguroBase = atual.fim >= info.total || atual.fim - base >= BORDA_JANELA_EDITOR;
    if (seguroTopo && seguroBase) return;
    const extra = Math.min(80, Math.round(Math.abs(dy) / alt) * 4);
    setJanelaEditor({
      inicio: Math.max(0, linha - OVERSCAN_LINHAS_EDITOR - (dy < 0 ? extra : 0)),
      fim: base + OVERSCAN_LINHAS_EDITOR + (dy > 0 ? extra : 0),
    });
  }, []);

  const abrirArquivo = (caminho) => {
    if (projeto && projeto.binarios && projeto.binarios[caminho]) {
      const kb = Math.max(1, Math.round((projeto.binarios[caminho].tamanho || 0) / 1024));
      exibirAviso(caminho.split('/').pop(), `Arquivo binário (${kb} KB): não abre no editor de texto. Segure o dedo nele pra excluir ou substituir.`, 'aviso');
      return;
    }
    setAbasAbertas((atual) => (atual.includes(caminho) ? atual : [...atual, caminho]));
    setArquivoAtivo(caminho); // o efeito abaixo (trocou de arquivo ativo) já reseta a janela/rolagem
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

  const historicoDe = (caminho) => {
    if (!historicoRef.current[caminho]) historicoRef.current[caminho] = { undo: [], redo: [] };
    return historicoRef.current[caminho];
  };

  const gravarTextoAtivo = (texto) => {
    conteudoAtivoRef.current = texto;
    setProjeto((atual) => ({ ...atual, conteudos: { ...atual.conteudos, [arquivoAtivo]: texto } }));
  };

  const alterarConteudo = (texto) => {
    if (!arquivoAtivo) return;
    const antes = conteudoAtivoRef.current;
    if (texto === antes) return;
    const h = historicoDe(arquivoAtivo);
    h.undo.push(diffTexto(antes, texto));
    if (h.undo.length > LIMITE_HISTORICO) h.undo.shift();
    h.redo = []; // editou de novo → o "refazer" antigo perde o sentido
    gravarTextoAtivo(texto);
  };

  // O TextInput só tem o TRECHO; aqui encaixa o que ele devolveu de volta
  // no texto inteiro e ajusta o fim do trecho se entraram/saíram linhas.
  const alterarTrecho = (novoTrecho) => {
    if (!arquivoAtivo) return;
    const { offset, tamanho, quebras } = trechoInfoRef.current;
    const completo = conteudoAtivoRef.current;
    const novo = completo.slice(0, offset) + novoTrecho + completo.slice(offset + tamanho);
    let q = 0;
    for (let i = 0; i < novoTrecho.length; i++) if (novoTrecho.charCodeAt(i) === 10) q++;
    const delta = q - quebras;
    alterarConteudo(novo);
    if (delta !== 0) setTrecho((t) => ({ ini: t.ini, fim: t.fim + delta }));
  };

  // O TextInput nativo já move o cursor sozinho; o React só precisa saber
  // onde ele está pra rolar/sugerir. Atualizar esse estado a cada tecla
  // gerava um 2º render da tela inteira colado no do texto e deixava a
  // digitação pesada — agora espera ~80ms parado.
  const agendarCaret = (pos) => {
    clearTimeout(caretTimerRef.current);
    caretTimerRef.current = setTimeout(() => setCaretPos(pos), 80);
  };

  const posicionarCursor = (pos) => {
    selecaoRef.current = { start: pos, end: pos };
    clearTimeout(caretTimerRef.current);
    setCaretPos(pos);
    setSelecaoForcada({ start: pos, end: pos });
    setTimeout(() => setSelecaoForcada(null), 80);
  };

  // 👈 volta o último passo (1 letra digitada, ou 1 colagem inteira).
  const desfazer = () => {
    if (!arquivoAtivo) return;
    const h = historicoDe(arquivoAtivo);
    const passo = h.undo.pop();
    if (!passo) return;
    const atual = conteudoAtivoRef.current;
    if (atual.slice(passo.p, passo.p + passo.inserido.length) !== passo.inserido) {
      h.undo = []; h.redo = []; // texto mudou por fora: histórico não vale mais
      return;
    }
    h.redo.push(passo);
    gravarTextoAtivo(atual.slice(0, passo.p) + passo.removido + atual.slice(passo.p + passo.inserido.length));
    posicionarCursor(passo.p + passo.removido.length);
  };

  // 👉 refaz o que o 👈 desfez.
  const refazer = () => {
    if (!arquivoAtivo) return;
    const h = historicoDe(arquivoAtivo);
    const passo = h.redo.pop();
    if (!passo) return;
    const atual = conteudoAtivoRef.current;
    if (atual.slice(passo.p, passo.p + passo.removido.length) !== passo.removido) {
      h.undo = []; h.redo = [];
      return;
    }
    h.undo.push(passo);
    gravarTextoAtivo(atual.slice(0, passo.p) + passo.inserido + atual.slice(passo.p + passo.removido.length));
    posicionarCursor(passo.p + passo.inserido.length);
  };

  const alternarPasta = (caminho) => {
    setPastasAbertas((atual) => ({ ...atual, [caminho]: !atual[caminho] }));
  };

  // Grava o projeto inteiro em disco (é de lá que o compilador nativo vai
  // ler). Devolve a pasta, ou null se der erro (já avisa o usuário).
  const salvarNoDisco = async (projOverride) => {
    const alvo = projOverride || projeto;
    if (!alvo) return null;
    try {
      return await gravarProjetoStudio(alvo);
    } catch (e) {
      exibirAviso(TITULO_MANUTENCAO, MSG_MANUTENCAO, 'erro');
      return null;
    }
  };

  // Liga/desliga uma permissão: escreve (ou apaga) a linha <uses-permission>
  // no AndroidManifest.xml do projeto. O arquivo nunca é excluído.
  const alternarPermissao = (nomePermissao, ligar) => {
    setProjeto((atual) => {
      if (!atual) return atual;
      const xml = atual.conteudos[MANIFEST_PATH_STUDIO];
      if (xml === undefined) return atual;
      const novo = ligar ? ativarPermissaoManifest(xml, nomePermissao) : desativarPermissaoManifest(xml, nomePermissao);
      if (novo === xml) return atual;
      return { ...atual, conteudos: { ...atual.conteudos, [MANIFEST_PATH_STUDIO]: novo } };
    });
    // o texto mudou "por fora" do teclado: o desfazer antigo do manifest não vale mais
    delete historicoRef.current[MANIFEST_PATH_STUDIO];
  };

  // ▶ — grava, garante o android.jar e roda o pipeline nativo.
  // Escolhe o .keystore/.p12 no celular e guarda uma cópia dentro do app
  // (o seletor devolve um arquivo temporário de cache).
  const escolherKeystore = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets || !r.assets.length) return;
      const arq = r.assets[0];
      const nome = String(arq.name || 'release.keystore').replace(/[^A-Za-z0-9._-]/g, '_');
      const pastaKeys = `${FileSystem.documentDirectory}cindrastudio/_keys/`;
      await FileSystem.makeDirectoryAsync(pastaKeys, { intermediates: true });
      const destino = `${pastaKeys}${nome}`;
      const antigo = await FileSystem.getInfoAsync(destino);
      if (antigo.exists) await FileSystem.deleteAsync(destino, { idempotent: true });
      await FileSystem.copyAsync({ from: arq.uri, to: destino });
      const info = { nome, caminho: destino };
      setKeystoreInfo(info);
      salvarPref('keystore', info);
      if (/\.jks$/i.test(nome)) {
        exibirAviso('Keystore .jks', 'O Android não abre .jks. Converta pra .p12 no PC (keytool -importkeystore ... -deststoretype PKCS12).', 'aviso');
      }
    } catch (e) {
      exibirAviso(TITULO_MANUTENCAO, MSG_MANUTENCAO, 'erro');
    }
  };

  // modo: 'debug' (chave interna do Cindra) ou 'release' (keystore escolhido).
  // Toque em compilar: se a marca d'água ainda não foi removida neste
  // aparelho, mostra o popup do código secreto antes de compilar.
  const compilarProjeto = (modo = 'debug') => {
    if (compilando) return;
    if (MARCA_REMOVIDA_STUDIO) { compilarProjetoReal(modo); return; }
    modoPendenteRef.current = modo;
    setCodigoDigitado('');
    setErroCodigo('');
    setPopupCodigo(true);
  };
  const aplicarCodigoSecreto = () => {
    if (!codigoSemMarcaValido(codigoDigitado)) {
      setErroCodigo('Código incorreto. Confira e tente de novo.');
      return;
    }
    MARCA_REMOVIDA_STUDIO = true;
    salvarPref('marcaRemovida', true); // grava no aparelho: não pede mais
    Keyboard.dismiss();
    setPopupCodigo(false);
    setCodigoDigitado('');
    setErroCodigo('');
    setTimeout(() => compilarProjetoReal(modoPendenteRef.current), 200);
  };
  const compilarComMarca = () => {
    Keyboard.dismiss();
    setPopupCodigo(false);
    setCodigoDigitado('');
    setErroCodigo('');
    setTimeout(() => compilarProjetoReal(modoPendenteRef.current), 200);
  };

  const compilarProjetoReal = async (modo = 'debug') => {
    if (compilando) return;
    const release = modo === 'release';
    if (release) {
      if (!keystoreInfo) { exibirAviso('Falta o keystore', 'Escolha o arquivo .keystore / .p12 pra assinar o release.', 'aviso'); return; }
      if (!senhaKeystore) { exibirAviso('Falta a senha', 'Digite a senha do keystore.', 'aviso'); return; }
    }
    if (!ApkBuilder.disponivel) {
      exibirAviso(TITULO_MANUTENCAO, MSG_MANUTENCAO, 'aviso');
      return;
    }
    setCompilando(true);
    setApkGerado(null);
    setErrosCompilacao([]);
    setLogCompilacao([]);
    setPainelCompilacao(true);
    const add = (linha) => setLogCompilacao((atual) => atual.concat(linha).slice(-200));
    const assinatura = ApkBuilder.aoLogar(add);
    try {
      // Traz pro projeto o que foi mexido por fora na pasta arquivos.
      const projSincronizado = await sincronizarPastaApp(true);
      add(MARCA_REMOVIDA_STUDIO ? 'Preparando o projeto (sem marca d\'água)...' : "Aplicando marca d'água do CindraStudio...");
      const pasta = await salvarNoDisco(projSincronizado || undefined);
      if (!pasta) {
        add('Não foi possível gravar o projeto em disco.');
        return;
      }
      add(MARCA_REMOVIDA_STUDIO ? 'Projeto preparado.' : "Marca d'água aplicada.");

      const amb = await ApkBuilder.ambiente();
      if (amb && amb.sdk < 26) throw new Error('O compilador precisa de Android 8 (API 26) ou mais novo.');
      if (amb && !amb.aapt2) throw new Error('aapt2 não encontrado no app (libaapt2.so). Veja o LEIAME do módulo.');

      let ultimoPct = -1;
      add('Preparando android.jar (só baixa na primeira vez)...');
      const jar = await garantirAndroidJarStudio((f) => {
        const pct = Math.floor(f * 10) * 10;
        if (pct !== ultimoPct) { ultimoPct = pct; add(`Baixando android.jar: ${pct}%`); }
      });

      // Um arquivo por build (carimbo de data/hora) — assim o histórico da
      // aba "Gerados" guarda todos os APKs, não só o último.
      const idBuild = `${Date.now()}`;
      const pastaSaida = `${FileSystem.documentDirectory}cindrastudio/_out/${projeto.pacote}/`;
      await FileSystem.makeDirectoryAsync(pastaSaida, { intermediates: true });
      const apkUri = `${pastaSaida}${idBuild}${release ? '-release' : ''}.apk`;
      const opcoesBuild = release
        ? {
            release: true,
            keystore: caminhoLocalStudio(keystoreInfo.caminho),
            senhaKeystore,
            alias: aliasKeystore.trim(),
            senhaChave,
          }
        : undefined;
      if (release) add(`Build release com o keystore ${keystoreInfo.nome}`);
      const r = await ApkBuilder.compilar(caminhoLocalStudio(pasta), jar, caminhoLocalStudio(apkUri), opcoesBuild);
      if (r.ok) {
        setApkGerado(caminhoLocalStudio(apkUri));
        registrarBuild({ id: idBuild, apkUri, release });
      } else {
        const doCodigo = (r.erros || []).filter((er) => er && er.arquivo && !REGEX_LINHA_TECNICA.test(`${er.arquivo} ${er.mensagem || ''}`));
        setErrosCompilacao(doCodigo);
        add(`Falhou na etapa: ${MSG_MANUTENCAO}`);
      }
    } catch (e) {
      add(`Erro: ${MSG_MANUTENCAO}`);
    } finally {
      assinatura.remove();
      setCompilando(false);
    }
  };

  // Grava o build bem-sucedido no histórico (aba "Gerados"). Falha aqui
  // nunca atrapalha a compilação: o APK já está pronto de qualquer jeito.
  const registrarBuild = async ({ id, apkUri, release }) => {
    try {
      let tamanho = 0;
      try {
        const info = await FileSystem.getInfoAsync(apkUri);
        tamanho = info && info.size ? info.size : 0;
      } catch (e) { /* tamanho é só enfeite */ }
      let fotoCopia = null;
      if (fotoIcone) {
        try {
          await FileSystem.makeDirectoryAsync(PASTA_ICONES_BUILDS_STUDIO, { intermediates: true });
          fotoCopia = `${PASTA_ICONES_BUILDS_STUDIO}${projeto.pacote}_${id}.png`;
          await FileSystem.copyAsync({ from: fotoIcone, to: fotoCopia });
        } catch (e) { fotoCopia = null; }
      }
      const versao = lerVersaoProjeto(projeto);
      const registro = {
        id,
        pacote: projeto.pacote,
        nomeApp,
        tipo: release ? 'release' : 'debug',
        versaoNome: versao.nome,
        versaoCodigo: versao.codigo,
        criadoEm: Number(id) || Date.now(),
        apk: apkUri,
        tamanho,
        fotoIcone: fotoCopia,
        corIcone,
        iconeEscolhido,
      };
      const atual = await lerBuildsStudio();
      const nova = [registro, ...atual];
      await gravarBuildsStudio(nova);
      setBuilds(nova);
      copiarBuildNovoParaPublica(registro);
    } catch (e) {
      // sem histórico desta vez, mas o APK existe.
    }
  };

  const verificarAcessoPastaPublica = async (abrirPedido) => {
    const ok = await testarAcessoPastaPublicaStudio();
    semAcessoPublicoRef.current = !ok;
    if (!ok && abrirPedido && !pedidoRecusadoRef.current) setPedirAcessoArquivos(true);
    if (ok) setPedirAcessoArquivos(false);
    return ok;
  };

  const liberouAcessoPastaPublica = async () => {
    const ok = await verificarAcessoPastaPublica(false);
    if (!ok) return;
    const r = await copiarPendentesPastaPublicaStudio(buildsRef.current);
    if (r.copiados > 0) {
      setBuilds(r.lista);
      gravarBuildsStudio(r.lista).catch(() => {});
    }
    exibirAviso(
      'Pasta cindra-studio liberada',
      r.copiados > 0
        ? `${r.copiados} ${r.copiados === 1 ? 'APK copiado' : 'APKs copiados'} pra ${PASTA_PUBLICA_TEXTO}`
        : `Os próximos APKs vão direto pra ${PASTA_PUBLICA_TEXTO}`,
      'sucesso'
    );
  };

  // Abre a tela do Android onde se libera "Acesso a todos os arquivos".
  const abrirConfigAcessoArquivos = () => {
    if (ApkBuilder.temPastaNativa) {
      ApkBuilder.abrirAcessoTodosArquivos().catch(() => {});
      return;
    }
    Linking.sendIntent('android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION')
      .catch(() => Linking.openSettings())
      .catch(() => {});
  };

  // Build recém-compilado: copia pra /storage/emulated/0/cindra-studio.
  // Se falhar (sem permissão), avisa uma vez só por sessão.
  const copiarBuildNovoParaPublica = async (registro) => {
    const r = await copiarParaPastaPublicaStudio(registro);
    if (r.ok) {
      setBuilds((atual) => {
        const nova = atual.map((x) => (x.id === registro.id ? { ...x, apkPublico: r.destino } : x));
        gravarBuildsStudio(nova).catch(() => {});
        return nova;
      });
    } else if (!avisoPastaPublicaRef.current) {
      avisoPastaPublicaRef.current = true;
      exibirAviso(
        'APK não foi pra cindra-studio',
        `Libere "Acesso a todos os arquivos" pro Cindra (toque na pasta no topo da aba Gerados).`,
        'aviso'
      );
    }
  };

  // Botão da pasta na aba Gerados: manda tudo que falta pra cindra-studio.
  const copiarTodosParaPublica = async () => {
    if (copiandoPublica) return;
    setCopiandoPublica(true);
    try {
      const r = await copiarPendentesPastaPublicaStudio(builds);
      if (r.copiados > 0) {
        setBuilds(r.lista);
        gravarBuildsStudio(r.lista).catch(() => {});
      }
      if (r.falhou) {
        exibirAviso(
          'Sem permissão pra criar a pasta',
          `Ative "Acesso a todos os arquivos" pro Cindra na tela que vai abrir e toque na pasta de novo.`,
          'aviso'
        );
        abrirConfigAcessoArquivos();
      } else if (r.copiados > 0) {
        exibirAviso('Copiado', `${r.copiados} ${r.copiados === 1 ? 'APK' : 'APKs'} em ${PASTA_PUBLICA_TEXTO}`, 'sucesso');
      } else {
        exibirAviso('Tudo certo', `Todos os APKs já estão em ${PASTA_PUBLICA_TEXTO}`, 'sucesso');
      }
    } finally {
      setCopiandoPublica(false);
    }
  };

  // Abre o menu de compartilhar do Android com o arquivo .apk.
  const compartilharApk = async (caminho, nome) => {
    if (!Sharing) {
      exibirAviso('Falta o expo-sharing', 'Rode "npx expo install expo-sharing" e faça um build novo pra liberar o compartilhamento.', 'aviso');
      return;
    }
    try {
      const uri = String(caminho).indexOf('file://') === 0 ? caminho : `file://${caminho}`;
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        exibirAviso('APK não encontrado', 'Esse arquivo foi apagado do celular. Compile de novo pra gerar outro.', 'aviso');
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        exibirAviso('Compartilhar indisponível', 'Esse aparelho não oferece o menu de compartilhar.', 'erro');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/vnd.android.package-archive',
        dialogTitle: `Compartilhar ${nome || 'APK'}`,
      });
    } catch (e) {
      exibirAviso(TITULO_MANUTENCAO, MSG_MANUTENCAO, 'erro');
    }
  };

  const instalarBuild = async (b) => {
    try {
      const info = await FileSystem.getInfoAsync(b.apk);
      if (!info.exists) {
        exibirAviso('APK não encontrado', 'Esse arquivo foi apagado do celular. Compile de novo pra gerar outro.', 'aviso');
        return;
      }
      const r = await ApkBuilder.instalar(caminhoLocalStudio(b.apk));
      if (r === 'permissao') {
        exibirAviso('Libere a instalação', 'Ative "Permitir desta fonte" pro Cindra na tela que abriu e toque em Instalar de novo.', 'aviso');
      }
    } catch (e) {
      exibirAviso(TITULO_MANUTENCAO, MSG_MANUTENCAO, 'erro');
    }
  };

  const apagarBuilds = async (ids) => {
    const alvo = builds.filter((b) => ids.includes(b.id));
    alvo.forEach((b) => {
      FileSystem.deleteAsync(b.apk, { idempotent: true }).catch(() => {});
      if (b.apkPublico) FileSystem.deleteAsync(b.apkPublico, { idempotent: true }).catch(() => {});
      if (b.fotoIcone) FileSystem.deleteAsync(b.fotoIcone, { idempotent: true }).catch(() => {});
    });
    const nova = builds.filter((b) => !ids.includes(b.id));
    setBuilds(nova);
    setConfirmarApagarBuild(null);
    gravarBuildsStudio(nova).catch(() => {});
  };

  // Primeiro toque na lixeira arma ("apagar?"), o segundo apaga de fato.
  const tocarLixeiraBuild = (b) => {
    if (confirmarApagarBuild === b.id) { apagarBuilds([b.id]); return; }
    setConfirmarApagarBuild(b.id);
  };

  const sairSelecaoBuilds = () => {
    setModoSelecaoBuilds(false);
    setSelecionadosBuilds({});
    setConfirmarApagarLote(false);
  };
  const iniciarSelecaoBuilds = (id) => {
    setConfirmarApagarBuild(null);
    setConfirmarApagarGrupo(null);
    setConfirmarApagarLote(false);
    setModoSelecaoBuilds(true);
    setSelecionadosBuilds(id ? { [id]: true } : {});
  };
  const alternarSelecaoBuild = (id) => {
    setConfirmarApagarLote(false);
    setSelecionadosBuilds((a) => {
      const n = { ...a };
      if (n[id]) delete n[id]; else n[id] = true;
      return n;
    });
  };
  const selecionarTodosBuilds = () => {
    setConfirmarApagarLote(false);
    setSelecionadosBuilds((a) => {
      if (builds.length > 0 && Object.keys(a).length === builds.length) return {};
      const n = {};
      builds.forEach((b) => { n[b.id] = true; });
      return n;
    });
  };
  // 1º toque arma ("Confirmar"), 2º toque apaga os marcados.
  const apagarSelecionadosBuilds = async () => {
    const ids = Object.keys(selecionadosBuilds);
    if (!ids.length) return;
    if (!confirmarApagarLote) { setConfirmarApagarLote(true); return; }
    await apagarBuilds(ids);
    sairSelecaoBuilds();
  };
  const tocarApagarGrupo = (g) => {
    if (confirmarApagarGrupo === g.pacote) {
      setConfirmarApagarGrupo(null);
      apagarBuilds(g.itens.map((b) => b.id));
      return;
    }
    setConfirmarApagarGrupo(g.pacote);
  };

  const instalarApk = async () => {
    if (!apkGerado) return;
    try {
      const r = await ApkBuilder.instalar(apkGerado);
      if (r === 'permissao') {
        exibirAviso('Libere a instalação', 'Ative "Permitir desta fonte" pro Cindra na tela que abriu e toque em Instalar de novo.', 'aviso');
      }
    } catch (e) {
      exibirAviso(TITULO_MANUTENCAO, MSG_MANUTENCAO, 'erro');
    }
  };

  // Toque num erro: abre o arquivo dele no editor, vai até a linha do erro
  // e deixa a linha marcada em vermelho (se o erro trouxe o número da linha).
  const abrirErro = (erro) => {
    if (projeto && projeto.conteudos[erro.arquivo] !== undefined) {
      setPainelCompilacao(false);
      const linha = Number(erro.linha);
      if (linha > 0) {
        const doArquivo = errosCompilacao
          .filter((e) => e && e.arquivo === erro.arquivo && Number(e.linha) > 0)
          .sort((a, b) => Number(a.linha) - Number(b.linha));
        const k = doArquivo.indexOf(erro);
        if (k >= 0) setErroIdx(k);
        setMarcasErroOcultas(false);
        irParaArquivoLinha(erro.arquivo, linha, 0);
      } else {
        abrirArquivo(erro.arquivo);
      }
    }
  };

  const conteudoAtivo = projeto && arquivoAtivo ? (projeto.conteudos[arquivoAtivo] || '') : '';
  conteudoAtivoRef.current = conteudoAtivo;
  const hist = arquivoAtivo ? historicoRef.current[arquivoAtivo] : null;
  const podeDesfazer = !!(hist && hist.undo.length > 0);
  const podeRefazer = !!(hist && hist.redo.length > 0);
  // O TextInput e a camada colorida usam allowFontScaling={false}, então a
  // escala de fonte do sistema NÃO muda o tamanho das letras nem a altura da
  // linha. Multiplicar por ela aqui fazia as linhas/colunas calculadas por
  // fora (cor, números, busca) descolarem do cursor linha por linha quando a
  // fonte do Android não era 100%.
  const alturaLinhaEditor = linhaSemDrift(20 * zoomEditor);

  // Só recalcula (split da string inteira + varredura pra achar a linha mais
  // comprida) quando o TEXTO muda de verdade. Antes isso rodava em TODO
  // re-render — inclusive os que não mexem no conteúdo, tipo só mover o
  // cursor ou o teclado abrir/fechar — e num arquivo grande cada varredura
  // dessas trava a digitação por um instante.
  const { linhasAtivas, numeroDeLinhas, larguraCodigo } = useMemo(() => {
    const linhas = conteudoAtivo.split('\n');
    let maior = 0;
    for (let i = 0; i < linhas.length; i++) {
      if (linhas[i].length > maior) maior = linhas[i].length;
    }
    // Sem quebra de linha: cada linha lógica ocupa exatamente uma linha
    // visual (os números da esquerda batem com o código) e linhas compridas
    // rolam na horizontal. Largura do código = maior linha × largura do
    // caractere monoespaçado (~0,6em, corrigida pela escala de fonte do
    // sistema) + folga, nunca menor que a área visível.
    const larguraCaractere = CODIGO_FONTE * 0.6 * zoomEditor;
    const largura = Math.max(larguraVisivelCodigo, Math.ceil((maior + 8) * larguraCaractere) + 24);
    return { linhasAtivas: linhas, numeroDeLinhas: linhas.length, larguraCodigo: largura };
  }, [conteudoAtivo, larguraVisivelCodigo, zoomEditor]);

  // Recorte de linhas que a janela do editor manda desenhar agora, já
  // limitado ao tamanho real do arquivo (o arquivo pode ter menos linhas
  // que a janela pedida, ex.: arquivo pequeno ou acabou de abrir).
  const digitosNumeroLinhas = String(numeroDeLinhas).length;
  const larguraGutter = Math.ceil(digitosNumeroLinhas * 13 * 0.6 * zoomEditor) + 16;
  const alturaTotalCodigo = 28 + numeroDeLinhas * alturaLinhaEditor;

  // Trecho carregado no TextInput (sempre com pelo menos 1 linha).
  const trechoIni = Math.min(Math.max(0, trecho.ini), Math.max(0, numeroDeLinhas - 1));
  const trechoFim = Math.max(trechoIni + 1, Math.min(trecho.fim, numeroDeLinhas));
  const textoTrecho = useMemo(
    () => linhasAtivas.slice(trechoIni, trechoFim).join('\n'),
    [linhasAtivas, trechoIni, trechoFim]
  );
  const offsetTrecho = useMemo(() => {
    let o = 0;
    for (let i = 0; i < trechoIni; i++) o += linhasAtivas[i].length + 1;
    return o;
  }, [linhasAtivas, trechoIni]);
  trechoInfoRef.current = {
    ini: trechoIni,
    fim: trechoFim,
    offset: offsetTrecho,
    tamanho: textoTrecho.length,
    quebras: trechoFim - trechoIni - 1,
    total: numeroDeLinhas,
  };
  const selecaoTrecho = selecaoForcada
    ? {
        start: Math.min(Math.max(0, selecaoForcada.start - offsetTrecho), textoTrecho.length),
        end: Math.min(Math.max(0, selecaoForcada.end - offsetTrecho), textoTrecho.length),
      }
    : undefined;

  // Destaque de sintaxe: linguagem do arquivo aberto e a regex já cacheada
  // pra ela (null pra extensão desconhecida = sem cor, comportamento antigo).
  const linguagemAtiva = useMemo(() => detectarLinguagem(arquivoAtivo), [arquivoAtivo]);
  const regexLinguagemAtiva = useMemo(() => obterRegexLinguagem(linguagemAtiva), [linguagemAtiva]);

  // Tokeniza só as linhas da janela visível — igual à coluna de números —
  // e só refaz quando essas linhas, a janela ou a linguagem mudam de fato.
  // Guardamos o texto de cada linha junto com o índice pra nunca "sobrar"
  // cor de uma janela antiga colada numa linha errada enquanto o novo
  // cálculo não chega (a causa mais comum de highlight bugado/dessincronizado
  // nesse tipo de overlay).

  // Trocou de tela (home ↔ workspace): começa com histórico limpo, pra um
  // projeto novo nunca herdar passos de outro que tenha os mesmos caminhos.
  useEffect(() => { historicoRef.current = {}; }, [etapa]);

  // Trocou de arquivo ativo (aba nova, ou fechou uma aba e caiu noutra):
  // a janela de linhas desenhadas volta pro topo, senão ficaria mostrando
  // as linhas de onde o arquivo anterior estava rolado.
  useEffect(() => {
    scrollYEditorRef.current = 0;
    ultimoYJanelaRef.current = 0;
    setJanelaEditor({ inicio: 0, fim: 120 });
    setTrecho({ ini: 0, fim: 150 });
  }, [arquivoAtivo]);

  // Depois que o trecho muda de lugar, devolve o cursor pra onde estava
  // (se ele ainda está dentro do trecho novo).
  useEffect(() => {
    if (primeiraTrocaTrechoRef.current) { primeiraTrocaTrechoRef.current = false; return undefined; }
    const info = trechoInfoRef.current;
    if (caretPos < info.offset || caretPos > info.offset + info.tamanho) return undefined;
    setSelecaoForcada({ start: caretPos, end: caretPos });
    const t = setTimeout(() => setSelecaoForcada(null), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trechoIni]);

  // Altura do teclado: o app desenha de ponta a ponta (edge-to-edge) e o
  // teclado fica POR CIMA da tela, então a gente encolhe a área do editor
  // pelo tamanho do teclado — o código passa a terminar logo acima dele.
  useEffect(() => {
    const [evMostrar, evEsconder] = Platform.OS === 'ios'
      ? ['keyboardWillShow', 'keyboardWillHide']
      : ['keyboardDidShow', 'keyboardDidHide'];
    const a = Keyboard.addListener(evMostrar, (e) => {
      const kb = e && e.endCoordinates;
      const h = (kb && kb.height) || 0;
      tecladoInfoRef.current = h > 0 ? { h, screenY: kb && typeof kb.screenY === 'number' ? kb.screenY : null } : null;
      setTecladoVisivel(h > 0);
      recalcularTecladoRef.current();
    });
    const b = Keyboard.addListener(evEsconder, () => {
      tecladoInfoRef.current = null;
      setTecladoVisivel(false);
      setAlturaTeclado(0);
    });
    return () => { a.remove(); b.remove(); };
  }, []);

  // Com o teclado aberto, rola o editor pra linha do cursor nunca ficar
  // escondida (TextInput multiline dentro de ScrollView não faz isso sozinho).
  useEffect(() => {
    if (!arquivoAtivo || !tecladoVisivel) return undefined;
    const t = setTimeout(() => {
      const rolagem = scrollEditorRef.current;
      const visivel = alturaAreaEditorRef.current;
      if (!rolagem || !visivel) return;
      const linha = linhaDoOffset(linhasAtivas, caretPos);
      const topo = 14 + linha * alturaLinhaEditor;
      const base = topo + alturaLinhaEditor;
      const y = scrollYEditorRef.current;
      if (base + 12 > y + visivel) rolagem.scrollTo({ y: base + 12 - visivel, animated: true });
      else if (topo - 12 < y) rolagem.scrollTo({ y: Math.max(0, topo - 12), animated: true });
    }, 60);
    return () => clearTimeout(t);
  }, [caretPos, alturaTeclado, tecladoVisivel, arquivoAtivo, alturaLinhaEditor]);

  // Garante que a linha onde o cursor está sempre faz parte da janela
  // desenhada — assim, ao digitar rápido ou pular de linha, o trecho atual
  // nunca fica "sumido" esperando a próxima rolagem pra reaparecer.
  useEffect(() => {
    if (!arquivoAtivo) return;
    const linha = linhaDoOffset(linhasAtivas, caretPos);
    const info = trechoInfoRef.current;
    if ((linha < info.ini && info.ini > 0) || (linha >= info.fim && info.fim < info.total)) {
      ignorarSelecaoAteRef.current = Date.now() + 250;
      setTrecho({ ini: Math.max(0, linha - TRECHO_FOLGA_LINHAS), fim: linha + TRECHO_FOLGA_LINHAS });
    }
    const atual = janelaStoreRef.current.get();
    if (linha < atual.inicio + 5 || linha > atual.fim - 5) {
      setJanelaEditor({
        inicio: Math.max(0, linha - OVERSCAN_LINHAS_EDITOR),
        fim: linha + OVERSCAN_LINHAS_EDITOR * 2,
      });
    }
  }, [caretPos, conteudoAtivo, arquivoAtivo]);

  // =====================================================================
  // Ferramentas do editor: zoom, ir para linha/posição, buscar e
  // substituir, snippets/autocompletar, símbolos e erro na linha.
  // =====================================================================
  linhasAtivasRef.current = linhasAtivas;
  alturaLinhaRef.current = alturaLinhaEditor;

  // Mudou o zoom: a altura de cada linha muda, mas a rolagem continua no
  // mesmo número de pixels — então o que estava na tela "pulava" pra outra
  // linha (zoom in jogava pra cima, zoom out pra baixo). Aqui a rolagem é
  // reescalada pra manter a MESMA linha no mesmo lugar da tela: a linha do
  // cursor, se ela está visível; senão a linha do meio da tela.
  useEffect(() => {
    const antes = alturaLinhaAnteriorRef.current;
    alturaLinhaAnteriorRef.current = alturaLinhaEditor;
    if (!antes || Math.abs(antes - alturaLinhaEditor) < 0.0001) return undefined;
    const visivel = alturaAreaEditorRef.current || 0;
    if (!visivel) return undefined;
    const y = scrollYEditorRef.current || 0;
    const linhaCursor = linhaDoOffset(linhasAtivasRef.current, selecaoRef.current.end || 0);
    const posCursorNaTela = 14 + linhaCursor * antes - y;
    let novoY;
    if (posCursorNaTela >= 0 && posCursorNaTela <= visivel) {
      novoY = 14 + linhaCursor * alturaLinhaEditor - posCursorNaTela; // cursor fica parado na tela
    } else {
      const linhaMeio = (y + visivel / 2 - 14) / antes;               // linha (fracionada) do meio da tela
      novoY = 14 + linhaMeio * alturaLinhaEditor - visivel / 2;
    }
    novoY = Math.max(0, novoY);
    scrollYEditorRef.current = novoY;
    const id = requestAnimationFrame(() => {
      if (scrollEditorRef.current) scrollEditorRef.current.scrollTo({ y: novoY, animated: false });
      atualizarJanelaEditor(novoY, visivel, alturaLinhaEditor);
    });
    return () => cancelAnimationFrame(id);
  }, [alturaLinhaEditor]);

  useEffect(() => () => {
    clearTimeout(zoomTimerRef.current);
    clearTimeout(destaqueTimerRef.current);
    clearTimeout(caretTimerRef.current);
    clearTimeout(trechoTimerRef.current);
  }, []);

  // ---------- Zoom (dois dedos ou botões − / +) ----------
  const lembrarZoom = () => {
    setZoomVisivel(true);
    clearTimeout(zoomTimerRef.current);
    zoomTimerRef.current = setTimeout(() => setZoomVisivel(false), 1000);
  };
  const definirZoom = (valor, salvar) => {
    const z = Math.round(Math.min(ZOOM_MAX_EDITOR, Math.max(ZOOM_MIN_EDITOR, valor)) * 20) / 20;
    if (z !== zoomRef.current) { zoomRef.current = z; setZoomEditor(z); }
    lembrarZoom();
    if (salvar) salvarPref('zoomEditor', z);
  };
  const distanciaDedos = (t) => Math.max(1, Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY));
  const aoTocarInicio = (e) => {
    const t = e.nativeEvent.touches;
    if (t && t.length >= 2) {
      pinchRef.current = { ativo: true, d0: distanciaDedos(t), z0: zoomRef.current };
      // Dedos em cima do TextInput fazem o Android mover o cursor pra onde
      // tocaram (e a tela rola até lá) — era isso que "ia pra linha errada"
      // ao dar zoom. Durante a pinça a seleção é ignorada.
      ignorarSelecaoAteRef.current = Date.now() + 600000;
      setPinchAtivo(true);
    }
  };
  const aoTocarMover = (e) => {
    const p = pinchRef.current;
    const t = e.nativeEvent.touches;
    if (!p.ativo || !t || t.length < 2) return;
    definirZoom(p.z0 * (distanciaDedos(t) / p.d0), false);
  };
  const aoTocarFim = (e) => {
    const p = pinchRef.current;
    if (!p.ativo) return;
    const t = e.nativeEvent.touches;
    if (!t || t.length < 2) {
      pinchRef.current = { ...p, ativo: false };
      setPinchAtivo(false);
      salvarPref('zoomEditor', zoomRef.current);
      // Acabou: volta a ouvir a seleção e devolve o cursor pra onde estava.
      ignorarSelecaoAteRef.current = Date.now() + 400;
      posicionarCursor(selecaoRef.current.end);
    }
  };

  // ---------- Ir para posição / linha ----------
  // Leva o editor até `pos` (offset no texto inteiro): recentra o trecho do
  // TextInput e a janela de linhas, rola na vertical e na horizontal, põe o
  // cursor ali e pisca a linha. `textoNovo` serve quando o texto acabou de
  // mudar e o render ainda não aconteceu.
  const irParaPosicao = (pos, textoNovo) => {
    const linhas = textoNovo !== undefined ? textoNovo.split('\n') : linhasAtivasRef.current;
    const total = linhas.length;
    let off = 0;
    let idx = 0;
    while (idx < total - 1 && off + linhas[idx].length + 1 <= pos) { off += linhas[idx].length + 1; idx += 1; }
    const col = Math.max(0, pos - off);
    const alt = alturaLinhaRef.current;
    ignorarSelecaoAteRef.current = Date.now() + 250;
    setTrecho({ ini: Math.max(0, idx - TRECHO_FOLGA_LINHAS), fim: idx + TRECHO_FOLGA_LINHAS });
    setJanelaEditor({ inicio: Math.max(0, idx - OVERSCAN_LINHAS_EDITOR), fim: idx + OVERSCAN_LINHAS_EDITOR * 2 });
    posicionarCursor(pos);
    const visivel = alturaAreaEditorRef.current || 400;
    const y = Math.max(0, 14 + idx * alt - visivel * 0.35);
    if (scrollEditorRef.current) scrollEditorRef.current.scrollTo({ y, animated: false });
    scrollYEditorRef.current = y;
    if (scrollHorizRef.current) {
      const x = Math.max(0, 12 + col * CODIGO_FONTE * 0.6 * zoomRef.current - (larguraVisivelCodigo || 300) * 0.3);
      scrollHorizRef.current.scrollTo({ x, animated: false });
    }
    setDestaqueLinha(idx);
    destaqueAnim.stopAnimation();
    destaqueAnim.setValue(0);
    Animated.sequence([
      Animated.timing(destaqueAnim, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.delay(420),
      Animated.timing(destaqueAnim, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setDestaqueLinha(-1); });
  };

  const irParaLinha = (numero, coluna = 0) => {
    const linhas = linhasAtivasRef.current;
    const idx = Math.min(Math.max(0, Math.floor(numero) - 1), linhas.length - 1);
    let off = 0;
    for (let i = 0; i < idx; i++) off += linhas[i].length + 1;
    irParaPosicao(off + Math.min(Math.max(0, coluna), linhas[idx].length));
  };

  // Abre o arquivo (se não for o ativo) e vai até a linha. Se o arquivo
  // for outro, a ida acontece no efeito logo abaixo, depois que a troca de
  // arquivo zerar a rolagem.
  const irParaArquivoLinha = (caminho, linha, coluna = 0) => {
    if (!caminho) return;
    if (caminho === arquivoAtivo) { irParaLinha(linha, coluna); return; }
    irPendenteRef.current = { arquivo: caminho, linha, coluna };
    abrirArquivo(caminho);
  };
  useEffect(() => {
    const p = irPendenteRef.current;
    if (!p || p.arquivo !== arquivoAtivo) return undefined;
    irPendenteRef.current = null;
    const t = setTimeout(() => irParaLinha(p.linha, p.coluna), 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivoAtivo]);

  // ---------- Inserir texto no cursor (símbolos, snippets, sugestões) ----------
  const substituirTrecho = (a, b, novoTexto, cursorRel) => {
    if (!arquivoAtivo) return;
    const atual = conteudoAtivoRef.current;
    const novo = atual.slice(0, a) + novoTexto + atual.slice(b);
    const contar = (s) => { let q = 0; for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) q++; return q; };
    const delta = contar(novoTexto) - contar(atual.slice(a, b));
    if (novo !== atual) {
      alterarConteudo(novo);
      if (delta !== 0) setTrecho((t) => ({ ini: t.ini, fim: t.fim + delta }));
    }
    posicionarCursor(a + cursorRel);
  };
  const faixaDaSelecao = () => {
    const tam = conteudoAtivoRef.current.length;
    const s = Math.min(selecaoRef.current.start, tam);
    const e = Math.min(selecaoRef.current.end, tam);
    return { a: Math.min(s, e), b: Math.max(s, e) };
  };
  const inserirSimbolo = (s) => {
    const { a, b } = faixaDaSelecao();
    substituirTrecho(a, b, s, s.length);
  };
  const moverCursorTecla = (d) => {
    const tam = conteudoAtivoRef.current.length;
    posicionarCursor(Math.min(Math.max(0, selecaoRef.current.end + d), tam));
  };
  const inserirSnippet = (s) => {
    const { a, b } = faixaDaSelecao();
    const exp = expandirSnippet(s.corpo, indentacaoDaLinha(conteudoAtivoRef.current, a));
    substituirTrecho(a, b, exp.texto, exp.cursor);
  };
  const aplicarSugestao = (s) => {
    const atual = conteudoAtivoRef.current;
    const pos = Math.min(selecaoRef.current.end, atual.length);
    const { ini } = palavraAntesDoCursor(atual, pos);
    if (s.tipo === 'snippet') {
      const exp = expandirSnippet(s.corpo, indentacaoDaLinha(atual, ini));
      // gatilho de XML digitado depois de um "<": o snippet já traz o "<"
      const ini2 = exp.texto.charAt(0) === '<' && atual.charAt(ini - 1) === '<' ? ini - 1 : ini;
      substituirTrecho(ini2, pos, exp.texto, exp.cursor);
    } else {
      substituirTrecho(ini, pos, s.texto, s.texto.length);
    }
  };

  // Sugestões de palavra em cima do teclado: DESLIGADAS (a faixa com a palavra
  // que aparecia ao tocar numa palavra). Fica sempre vazio, então a faixa não
  // aparece e também não gasta processamento a cada tecla/toque.
  const sugestoesAuto = SUGESTOES_AUTO_DESLIGADAS;

  const listaSnippets = linguagemAtiva === 'xml' ? SNIPPETS_XML_STUDIO : linguagemAtiva === 'java' ? SNIPPETS_JAVA_STUDIO : [];

  // ---------- Buscar e substituir ----------
  const buscaAtiva = barraEditor === 'buscar' && consultaEditor !== '';
  const matchesArquivo = useMemo(
    () => (buscaAtiva && arquivoAtivo ? acharOcorrenciasTexto(conteudoAtivo, consultaEditor, buscaMaiusc) : []),
    [buscaAtiva, arquivoAtivo, conteudoAtivo, consultaEditor, buscaMaiusc]
  );
  const idxBusca = matchesArquivo.length ? Math.min(buscaIdx, matchesArquivo.length - 1) : 0;
  // Cada ocorrência vira { linha, coluna } pra desenhar o realce amarelo.
  const marcasBusca = useMemo(() => {
    const marcas = [];
    let li = 0;
    let ini = 0;
    for (let k = 0; k < matchesArquivo.length; k++) {
      const m = matchesArquivo[k];
      while (li < linhasAtivas.length - 1 && ini + linhasAtivas[li].length + 1 <= m.pos) { ini += linhasAtivas[li].length + 1; li += 1; }
      marcas.push({ k, i: li, col: m.pos - ini, len: m.len });
    }
    return marcas;
  }, [matchesArquivo, linhasAtivas]);

  // Busca no projeto inteiro: espera a pessoa parar de digitar um instante.
  const conteudosProjeto = projeto ? projeto.conteudos : null;
  useEffect(() => {
    if (barraEditor !== 'buscar' || buscaEscopo !== 'projeto' || !consultaEditor || !conteudosProjeto) {
      setResultadosProjeto(null);
      return undefined;
    }
    const t = setTimeout(() => setResultadosProjeto(buscarNoProjetoStudio(conteudosProjeto, consultaEditor, buscaMaiusc)), 280);
    return () => clearTimeout(t);
  }, [barraEditor, buscaEscopo, consultaEditor, buscaMaiusc, conteudosProjeto]);

  const iniciarBusca = (texto, maiusc) => {
    const ms = acharOcorrenciasTexto(conteudoAtivoRef.current, texto, maiusc);
    if (!ms.length) { setBuscaIdx(0); return; }
    let k = ms.findIndex((m) => m.pos >= selecaoRef.current.start);
    if (k < 0) k = 0;
    setBuscaIdx(k);
    irParaPosicao(ms[k].pos);
  };
  const aoMudarConsulta = (t) => {
    setConsultaEditor(t);
    setConfirmarSubst(false);
    if (t) iniciarBusca(t, buscaMaiusc); else setBuscaIdx(0);
  };
  const alternarMaiusc = () => {
    const v = !buscaMaiusc;
    setBuscaMaiusc(v);
    setConfirmarSubst(false);
    if (consultaEditor) iniciarBusca(consultaEditor, v);
  };
  const irParaOcorrencia = (k) => {
    const m = matchesArquivo[k];
    if (!m) return;
    setBuscaIdx(k);
    irParaPosicao(m.pos);
  };
  const proximaOcorrencia = (dir) => {
    const n = matchesArquivo.length;
    if (!n) return;
    irParaOcorrencia((idxBusca + dir + n) % n);
  };
  const substituirAtual = () => {
    const m = matchesArquivo[idxBusca];
    if (!m || !arquivoAtivo) return;
    const atual = conteudoAtivoRef.current;
    const novo = atual.slice(0, m.pos) + substituirTexto + atual.slice(m.pos + m.len);
    alterarConteudo(novo);
    const ms = acharOcorrenciasTexto(novo, consultaEditor, buscaMaiusc);
    if (!ms.length) { setBuscaIdx(0); return; }
    let k = ms.findIndex((x) => x.pos >= m.pos + substituirTexto.length);
    if (k < 0) k = 0;
    setBuscaIdx(k);
    irParaPosicao(ms[k].pos, novo);
  };
  const substituirTodosArquivo = () => {
    if (!arquivoAtivo || !consultaEditor) return;
    const { novo, n } = substituirTudoTexto(conteudoAtivoRef.current, consultaEditor, buscaMaiusc, substituirTexto);
    if (!n) return;
    alterarConteudo(novo);
    setBuscaIdx(0);
    exibirAviso('Substituído', `${n} ${n === 1 ? 'ocorrência trocada' : 'ocorrências trocadas'} neste arquivo.`, 'sucesso');
  };
  const substituirTodosProjeto = () => {
    if (!projeto || !consultaEditor) return;
    if (!confirmarSubst) { setConfirmarSubst(true); return; }
    const mudados = {};
    let total = 0;
    let arquivosTrocados = 0;
    Object.keys(projeto.conteudos).forEach((caminho) => {
      const texto = projeto.conteudos[caminho];
      if (typeof texto !== 'string' || caminho === arquivoAtivo) return;
      const { novo, n } = substituirTudoTexto(texto, consultaEditor, buscaMaiusc, substituirTexto);
      if (n) {
        mudados[caminho] = novo;
        total += n;
        arquivosTrocados += 1;
        delete historicoRef.current[caminho]; // o texto mudou por fora: desfazer antigo não vale
      }
    });
    // o arquivo aberto passa pelo caminho normal pra continuar dando pra desfazer
    if (arquivoAtivo) {
      const { novo, n } = substituirTudoTexto(conteudoAtivoRef.current, consultaEditor, buscaMaiusc, substituirTexto);
      if (n) { alterarConteudo(novo); total += n; arquivosTrocados += 1; }
    }
    if (Object.keys(mudados).length) {
      setProjeto((atual) => ({ ...atual, conteudos: { ...atual.conteudos, ...mudados } }));
    }
    setConfirmarSubst(false);
    setBuscaIdx(0);
    exibirAviso(
      total ? 'Substituído no projeto' : 'Nada pra substituir',
      total ? `${total} ${total === 1 ? 'ocorrência trocada' : 'ocorrências trocadas'} em ${arquivosTrocados} ${arquivosTrocados === 1 ? 'arquivo' : 'arquivos'}.` : 'Nenhuma ocorrência encontrada.',
      total ? 'sucesso' : 'aviso'
    );
  };

  const abrirBarraBusca = () => {
    if (barraEditor === 'buscar') { setBarraEditor(null); setConfirmarSubst(false); return; }
    setBarraEditor('buscar');
    setConfirmarSubst(false);
    // se tinha um trecho (de uma linha só) selecionado, já usa como termo
    const { a, b } = faixaDaSelecao();
    if (b > a && b - a <= 80) {
      const sel = conteudoAtivoRef.current.slice(a, b);
      if (sel.indexOf('\n') === -1) { setConsultaEditor(sel); iniciarBusca(sel, buscaMaiusc); }
    }
  };
  const abrirBarraLinha = () => {
    if (barraEditor === 'linha') { setBarraEditor(null); return; }
    setLinhaDigitada('');
    setBarraEditor('linha');
  };
  const executarIrLinha = () => {
    const n = parseInt(linhaDigitada, 10);
    if (!n) return;
    irParaLinha(n);
    setBarraEditor(null);
    Keyboard.dismiss();
  };
  const fecharBarraEditor = () => { setBarraEditor(null); setConfirmarSubst(false); Keyboard.dismiss(); };

  // ---------- Erro da compilação na linha ----------
  const errosArquivo = useMemo(
    () => (arquivoAtivo
      ? errosCompilacao
        .filter((e) => e && e.arquivo === arquivoAtivo && Number(e.linha) > 0)
        .sort((a, b) => Number(a.linha) - Number(b.linha))
      : []),
    [errosCompilacao, arquivoAtivo]
  );
  const linhasComErro = useMemo(() => new Set(errosArquivo.map((e) => Number(e.linha))), [errosArquivo]);
  useEffect(() => { setErroIdx(0); setMarcasErroOcultas(false); }, [errosCompilacao]);
  const erroIdxSeguro = Math.min(erroIdx, Math.max(0, errosArquivo.length - 1));
  const irParaErro = (k) => {
    const n = errosArquivo.length;
    if (!n) return;
    const i = ((k % n) + n) % n;
    setErroIdx(i);
    irParaLinha(Number(errosArquivo[i].linha));
  };

  // ---------- Tela 0: lista de projetos (tela inicial) ----------
  const termoBusca = buscaProjeto.trim().toLowerCase();
  const listaFiltrada = termoBusca
    ? listaProjetos.filter(
        (p) => p.nomeApp.toLowerCase().includes(termoBusca) || p.pacote.toLowerCase().includes(termoBusca)
      )
    : listaProjetos;
  const agora = Date.now();
  const UMA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
  const editadoNaSemana = (p) => !!p.atualizadoEm && agora - p.atualizadoEm < UMA_SEMANA_MS;
  const totalFavoritos = listaProjetos.filter((p) => p.favorito).length;
  const totalSemana = listaProjetos.filter(editadoNaSemana).length;

  const listaPorFiltro = listaFiltrada.filter((p) => {
    if (filtroProjetos === 'favoritos') return !!p.favorito;
    if (filtroProjetos === 'semana') return editadoNaSemana(p);
    return true;
  });
  const listaExibida = [...listaPorFiltro].sort((a, b) => {
    if (favoritosNoTopo && !!a.favorito !== !!b.favorito) return a.favorito ? -1 : 1;
    if (ordenacao === 'nome') return a.nomeApp.localeCompare(b.nomeApp, 'pt-BR', { sensitivity: 'base' });
    if (ordenacao === 'nomeDesc') return b.nomeApp.localeCompare(a.nomeApp, 'pt-BR', { sensitivity: 'base' });
    if (ordenacao === 'antigos') return (a.atualizadoEm || 0) - (b.atualizadoEm || 0);
    return (b.atualizadoEm || 0) - (a.atualizadoEm || 0);
  });
  // "Retomar": o projeto mexido por último (entre todos, sem filtro).
  const ultimoProjeto = listaProjetos.reduce(
    (a, p) => (!a || (p.atualizadoEm || 0) > (a.atualizadoEm || 0) ? p : a),
    null
  );

  // ─────────────────────────────────────────────────────
  // NUVEM: login opcional + backup dos projetos (ver módulo "NUVEM CINDRA")
  // ─────────────────────────────────────────────────────
  const [contaNuvem, setContaNuvem] = useState(null); // { nome } | null
  const [statusNuvem, setStatusNuvem] = useState('ocioso'); // ocioso | sincronizando | ok | offline | erro
  const [loginNuvem, setLoginNuvem] = useState(null); // null | 'convite' | 'manual'
  const [contaNuvemAberta, setContaNuvemAberta] = useState(false);
  const [conviteNuvemPendente, setConviteNuvemPendente] = useState(false);
  const nuvemRef = useRef(null);
  const timerSyncRef = useRef(null);
  const syncandoRef = useRef(false);
  const syncDeNovoRef = useRef(false);
  const projetoMarcadoRef = useRef(null);
  const abertoRef = useRef(null);
  abertoRef.current = estadoRef.current ? nomePacote : null;

  const silencioRef = useRef(false);
  const [ultimaSyncNuvem, setUltimaSyncNuvem] = useState(0);
  // silencioso = verificação automática (não pisca o status "sincronizando").
  const agendarSyncNuvem = (ms = 2500, silencioso = false) => {
    clearTimeout(timerSyncRef.current);
    silencioRef.current = silencioso;
    timerSyncRef.current = setTimeout(() => { executarSyncNuvem(); }, ms);
  };

  const executarSyncNuvem = async () => {
    if (!nuvemRef.current || !nuvemRef.current.token) return;
    if (syncandoRef.current) { syncDeNovoRef.current = true; return; }
    syncandoRef.current = true;
    const silencioso = silencioRef.current;
    silencioRef.current = false;
    if (!silencioso) setStatusNuvem('sincronizando');
    let r;
    try {
      r = await sincronizarNuvemStudio({ abertoPacote: abertoRef.current });
    } catch (e) {
      r = { ok: false, pendencias: true };
    }
    syncandoRef.current = false;
    nuvemRef.current = await lerNuvemStudio();
    if (r.sessaoExpirada) {
      setContaNuvem(null);
      setStatusNuvem('ocioso');
      exibirAviso('Sessão expirada', 'Entre de novo na sua conta para continuar salvando na nuvem.', 'aviso');
      return;
    }
    if (r.mudouLista) lerListaProjetosStudio().then(setListaProjetos).catch(() => {});
    if (r.rejeitados && r.rejeitados.length) {
      exibirAviso('Alguns projetos não subiram', 'Estão grandes demais ou com arquivos inválidos para a nuvem.', 'erro');
    }
    if (r.semCota && r.semCota.length) {
      exibirAviso('Sem espaço na nuvem', 'Sua nuvem (100 MB por conta) está cheia. O projeto continua salvo no seu celular e sobe sozinho quando você liberar espaço.', 'aviso');
    }
    setStatusNuvem(r.ok ? 'ok' : r.semRede ? 'offline' : 'erro');
    if (r.ok) setUltimaSyncNuvem(Date.now());
    // se falhou, a verificação automática (a cada 5 s) tenta de novo sozinha
    if (syncDeNovoRef.current) { syncDeNovoRef.current = false; agendarSyncNuvem(1500); }
  };

  // Chamado depois que o autosave gravou: se o projeto mudou, marca pra subir.
  const marcarSeMudouNuvem = () => {
    const e = estadoRef.current;
    if (!e || !nuvemRef.current || !nuvemRef.current.token) return;
    if (e.projeto === projetoMarcadoRef.current) return;
    projetoMarcadoRef.current = e.projeto;
    marcarPendenteNuvem(e.nomePacote).then(() => {
      lerNuvemStudio().then((n) => { nuvemRef.current = n; }).catch(() => {});
      agendarSyncNuvem(2500);
    });
  };

  const aoLogarNuvem = async ({ token, nome }) => {
    const novo = { ...nuvemPadrao(), token, nome };
    await gravarNuvemStudio(novo);
    nuvemRef.current = novo;
    setContaNuvem({ nome });
    setLoginNuvem(null);
    setConviteNuvemPendente(false);
    salvarPref('perguntouLoginNuvem', true);
    exibirAviso('Conta conectada', 'Seus projetos agora são salvos na nuvem.', 'sucesso');
    agendarSyncNuvem(300);
  };

  const fecharLoginNuvem = () => {
    if (loginNuvem === 'convite') {
      salvarPref('perguntouLoginNuvem', true);
      setConviteNuvemPendente(false);
    }
    setLoginNuvem(null);
  };

  const sairDaNuvem = async () => {
    setContaNuvemAberta(false);
    clearTimeout(timerSyncRef.current);
    await sairNuvemStudio();
    nuvemRef.current = nuvemPadrao();
    setContaNuvem(null);
    setStatusNuvem('ocioso');
  };

  const tocarBolinhaConta = () => {
    if (contaNuvem) setContaNuvemAberta(true);
    else setLoginNuvem('manual');
  };

  // ─── Aba "Publicar": link de download dos apps (precisa de conta) ───
  const [publicados, setPublicados] = useState([]); // [{ slug, url, pacote, nome, ... }]
  const [carregandoPublicados, setCarregandoPublicados] = useState(false);
  const [erroPublicados, setErroPublicados] = useState('');
  const [publicandoPacote, setPublicandoPacote] = useState(null); // pacote em envio
  const [apagandoSlug, setApagandoSlug] = useState(null);

  const carregarPublicados = async () => {
    const n = nuvemRef.current;
    if (!n || !n.token) { setPublicados([]); return; }
    setCarregandoPublicados(true);
    const r = await listarPublicadosNuvem(n.token);
    setCarregandoPublicados(false);
    if (r.ok) { setPublicados(r.lista); setErroPublicados(''); }
    else if (r.status === 401) { setErroPublicados('Sessão expirada. Entre de novo na sua conta.'); }
    else setErroPublicados(r.mensagem);
  };

  useEffect(() => {
    if (abaHome === 'publicar' && contaNuvem) carregarPublicados();
    if (!contaNuvem) setPublicados([]);
  }, [abaHome, contaNuvem]);

  const abrirLinkPublicado = (url) => abrirLinkNoApp(url);

  // Publica (ou atualiza) o último APK gerado do projeto.
  const publicarGrupo = async (g) => {
    if (publicandoPacote) return;
    const n = nuvemRef.current;
    if (!n || !n.token) { setLoginNuvem('manual'); return; }
    const jaPublicado = publicados.some((p) => p.pacote === g.pacote);
    if (!jaPublicado && publicados.length >= LIMITE_PUBLICADOS_STUDIO) {
      exibirAviso('Limite de publicações', `Você já tem ${LIMITE_PUBLICADOS_STUDIO} apps publicados. Apague um link pra publicar outro.`, 'aviso');
      return;
    }
    const b = g.ultimo;
    setPublicandoPacote(g.pacote);
    try {
      const uri = String(b.apk).indexOf('file://') === 0 ? b.apk : `file://${b.apk}`;
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        exibirAviso('APK não encontrado', 'Esse arquivo foi apagado do celular. Compile de novo pra gerar outro.', 'aviso');
        return;
      }
      const ic = g.icone && g.icone.fotoIcone;
      const r = await publicarApkNuvem({
        token: n.token,
        pacote: g.pacote,
        nome: b.nomeApp,
        versao: b.versaoNome || '',
        apkCaminho: b.apk,
        iconeUri: ic ? (String(ic).indexOf('file://') === 0 ? ic : `file://${ic}`) : undefined,
      });
      if (r.ok) {
        exibirAviso(jaPublicado ? 'Link atualizado' : 'App publicado', String(r.url).replace(/^https:\/\//, ''), 'sucesso');
      } else if (r.status === 401) {
        setErroPublicados('Sessão expirada. Entre de novo na sua conta.');
      } else {
        exibirAviso('Não foi possível publicar', r.mensagem, 'erro');
      }
      await carregarPublicados();
    } catch (e) {
      exibirAviso('Não foi possível publicar', mensagemErroPublicar({ semRede: true }), 'erro');
    } finally {
      setPublicandoPacote(null);
    }
  };

  const apagarLinkPublicado = (p) => {
    const n = nuvemRef.current;
    if (!n || !n.token) return;
    Alert.alert('Apagar link?', `O APK sai do servidor e o link de ${p.nome} deixa de funcionar pra quem já recebeu.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          setApagandoSlug(p.slug);
          const ok = await removerLinkApkNuvem(n.token, p.slug);
          setApagandoSlug(null);
          if (ok) {
            setPublicados((l) => l.filter((x) => x.slug !== p.slug));
            exibirAviso('Link apagado', 'O download não está mais disponível.', 'sucesso');
          } else {
            exibirAviso('Não foi possível apagar', 'Tente de novo em instantes.', 'erro');
            carregarPublicados();
          }
        },
      },
    ]);
  };

  // Ao abrir o app: carrega a conta (se tiver) e sincroniza; senão pergunta uma vez.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const n = await lerNuvemStudio();
      const prefs = await lerPrefsStudio();
      if (!vivo) return;
      nuvemRef.current = n;
      if (n.token) { setContaNuvem({ nome: n.nome }); agendarSyncNuvem(2000); }
      else if (!prefs.perguntouLoginNuvem) setConviteNuvemPendente(true);
    })();
    return () => { vivo = false; clearTimeout(timerSyncRef.current); };
  }, []);

  // Voltou pro app ou passou um tempo: confere o servidor (pega o que mudou em outro aparelho).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') agendarSyncNuvem(1000); });
    // Sincronização automática: confere o servidor a cada 5 segundos.
    const iv = setInterval(() => { if (AppState.currentState === 'active') agendarSyncNuvem(0, true); }, 5000);
    return () => { sub.remove(); clearInterval(iv); };
  }, []);

  // Convite na primeira vez que o app abre (depois do pedido de acesso aos arquivos).
  useEffect(() => {
    if (conviteNuvemPendente && visible && estadoCarregado && etapa === 'home' && !pedirAcessoArquivos && !loginNuvem) {
      const t = setTimeout(() => setLoginNuvem('convite'), 900);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [conviteNuvemPendente, visible, estadoCarregado, etapa, pedirAcessoArquivos, loginNuvem]);

  const salvarPref = (chave, valor) => {
    prefsRef.current = { ...prefsRef.current, [chave]: valor };
    gravarPrefsStudio(prefsRef.current);
  };
  const fecharBusca = () => { setBuscaProjeto(''); setBuscaAberta(false); };

  // Botão voltar do celular: primeiro fecha o que estiver aberto por cima
  // (cards, menus, painéis) e depois volta UMA tela por vez, em vez de
  // jogar a pessoa pra fora do app. Na tela inicial, pergunta se quer sair.
  const voltarCelularRef = useRef(null);
  voltarCelularRef.current = () => {
    if (pedirAcessoArquivos) { pedidoRecusadoRef.current = true; setPedirAcessoArquivos(false); return; }
    if (confirmarSaida) { setConfirmarSaida(false); return; }
    if (cardProjeto) { setCardProjeto(null); return; }
    if (menuOrdenarAberto) { setMenuOrdenarAberto(false); return; }
    if (cardNo) { setCardNo(null); setPastaEmCriacao(false); setNomeNovaPasta(''); return; }
    if (permissoesAberto) { setPermissoesAberto(false); setBuscaPermissao(''); return; }
    if (snippetsAberto) { setSnippetsAberto(false); setFiltroSnippet(''); return; }
    if (menuProjetoAberto) { setMenuProjetoAberto(false); return; }
    if (painelCompilacao) { if (!compilando) setPainelCompilacao(false); return; }
    if (sidebarAberta) { setSidebarAberta(false); return; }
    if (barraEditor) { fecharBarraEditor(); return; }
    if (etapa === 'workspace') { voltarParaHome(); return; }
    if (etapa === 'config') { setEtapa('home'); return; }
    if (buscaAberta) { fecharBusca(); return; }
    if (abaHome === 'gerados') {
      if (modoSelecaoBuilds) { sairSelecaoBuilds(); return; }
      setAbaHome('apps');
      return;
    }
    if (abaHome === 'publicar') { setAbaHome('apps'); return; }
    if (abaHome === 'aprender') {
      if (buscaAprenderAberta) { setBuscaAprenderAberta(false); setBuscaAprender(''); return; }
      if (exemploAberto) setExemploAberto(null); else setAbaHome('apps');
      return;
    }
    setConfirmarSaida(true);
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (voltarCelularRef.current) voltarCelularRef.current();
      return true; // sempre consome o botão: quem decide se sai é a folha "Sair do app?"
    });
    return () => sub.remove();
  }, []);
  const alternarModoLista = () => {
    const novo = modoLista === 'lista' ? 'grade' : 'lista';
    setModoLista(novo);
    salvarPref('modoLista', novo);
  };
  const escolherOrdenacao = (id) => { setOrdenacao(id); salvarPref('ordenacao', id); };
  const alternarFavoritosNoTopo = (valor) => { setFavoritosNoTopo(valor); salvarPref('favoritosNoTopo', valor); };
  const dispensarAvisoRecuperar = () => {
    setAvisoRecuperarVisivel(false);
    salvarPref('avisoRecuperarDispensado', true);
  };
  const abrirLinkApoio = () => {
    if (!STUDIO_LINK_APOIO) {
      exibirAviso('Em breve', 'Esse link ainda não foi configurado.', 'aviso');
      return;
    }
    Linking.openURL(STUDIO_LINK_APOIO).catch(() => exibirAviso('Não foi possível abrir', 'Tente de novo mais tarde.', 'erro'));
  };

  const renderIconeProjeto = (p, lado = 52, icone = 28, raio = 16) => (
    <IconeAppStudio dados={p} lado={lado} icone={icone} raio={raio} />
  );

  const renderCardLista = (p, i) => (
    <ItemAnimadoStudio key={p.pacote} indice={i}>
      <TouchableOpacity
        style={studioStyles.projCard}
        onPress={() => abrirProjetoDaLista(p.pacote)}
        onLongPress={() => setCardProjeto(p)}
        delayLongPress={350}
        activeOpacity={0.8}
      >
        {renderIconeProjeto(p)}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={studioStyles.projNome} numberOfLines={1}>{p.nomeApp}</Text>
            {p.favorito && <MaterialCommunityIcons name="star" size={14} color={COLORS.gold} />}
          </View>
          <Text style={studioStyles.projPacote} numberOfLines={1}>{p.pacote}</Text>
          {!!p.atualizadoEm && (
            <View style={studioStyles.projTempoLinha}>
              <MaterialCommunityIcons name="clock-outline" size={12} color={COLORS.dim} />
              <Text style={studioStyles.projTempo}>{tempoRelativoStudio(p.atualizadoEm)}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => setCardProjeto(p)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={studioStyles.projMais}
        >
          <MaterialCommunityIcons name="dots-vertical" size={22} color={COLORS.dim} />
        </TouchableOpacity>
      </TouchableOpacity>
    </ItemAnimadoStudio>
  );

  const renderCardGrade = (p, i) => (
    <ItemAnimadoStudio key={p.pacote} indice={i} style={{ width: '48.5%', marginBottom: 10 }}>
      <TouchableOpacity
        style={studioStyles.gradeCard}
        onPress={() => abrirProjetoDaLista(p.pacote)}
        onLongPress={() => setCardProjeto(p)}
        delayLongPress={350}
        activeOpacity={0.8}
      >
        <View style={studioStyles.gradeTopo}>
          {renderIconeProjeto(p, 48, 26, 15)}
          <TouchableOpacity
            onPress={() => setCardProjeto(p)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={studioStyles.projMais}
          >
            <MaterialCommunityIcons name="dots-vertical" size={22} color={COLORS.dim} />
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12 }}>
          <Text style={[studioStyles.projNome, { flexShrink: 1 }]} numberOfLines={1}>{p.nomeApp}</Text>
          {p.favorito && <MaterialCommunityIcons name="star" size={14} color={COLORS.gold} />}
        </View>
        <Text style={studioStyles.projPacote} numberOfLines={1}>{p.pacote}</Text>
        {!!p.atualizadoEm && <Text style={studioStyles.gradeTempo}>{tempoRelativoStudio(p.atualizadoEm)}</Text>}
      </TouchableOpacity>
    </ItemAnimadoStudio>
  );

  const renderTileFiltro = (id, icone, numero, rotulo) => {
    const ativo = filtroProjetos === id;
    return (
      <TouchableOpacity
        key={id}
        style={[studioStyles.tile, ativo && studioStyles.tileAtivo]}
        onPress={() => setFiltroProjetos(id)}
        activeOpacity={0.85}
      >
        <View style={studioStyles.tileTopo}>
          <Text style={[studioStyles.tileNumero, ativo && { color: '#d9a2ff' }]}>{numero}</Text>
          <MaterialCommunityIcons name={icone} size={20} color={ativo ? '#d9a2ff' : COLORS.dim} />
        </View>
        <Text style={[studioStyles.tileRotulo, ativo && { color: COLORS.ink }]}>{rotulo}</Text>
      </TouchableOpacity>
    );
  };

  const renderHero = () => (
    <View style={studioStyles.heroCard}>
      <Grad cores={GRAD_LOGO_ESCURO} />
      <MaterialCommunityIcons
        name={ultimoProjeto.iconeEscolhido || ICONES_APP_STUDIO[0]}
        size={170}
        color="#ffffff"
        style={studioStyles.heroMarcaDagua}
      />
      <View style={studioStyles.heroTopo}>
        <View style={studioStyles.heroSelo}>
          <MaterialCommunityIcons name="lightning-bolt" size={13} color="#e9d5ff" />
          <Text style={studioStyles.heroSeloTexto}>RETOMAR</Text>
        </View>
        {!!ultimoProjeto.atualizadoEm && (
          <Text style={studioStyles.heroTempo}>Editado {tempoRelativoStudio(ultimoProjeto.atualizadoEm)}</Text>
        )}
      </View>
      <View style={studioStyles.heroCorpo}>
        {renderIconeProjeto(ultimoProjeto, 58, 30, 18)}
        <View style={{ flex: 1 }}>
          <Text style={studioStyles.heroNome} numberOfLines={1}>{ultimoProjeto.nomeApp}</Text>
          <Text style={studioStyles.heroPacote} numberOfLines={1}>Android · {ultimoProjeto.pacote}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={studioStyles.heroBtn}
        onPress={() => abrirProjetoDaLista(ultimoProjeto.pacote)}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="play" size={20} color="#3a1d7a" />
        <Text style={studioStyles.heroBtnText}>Continuar editando</Text>
      </TouchableOpacity>
    </View>
  );

  const renderAbaApps = () => {
    const buscando = !!termoBusca;
    const rotuloSecao = buscando
      ? 'Resultados'
      : filtroProjetos === 'favoritos'
        ? 'Favoritos'
        : filtroProjetos === 'semana'
          ? 'Esta semana'
          : 'Seus apps';
    const msgVazia = buscando
      ? `Nenhum app encontrado para "${buscaProjeto.trim()}".`
      : filtroProjetos === 'favoritos'
        ? 'Você ainda não favoritou nenhum app. Toque em ⋮ num app e escolha "Favoritar".'
        : 'Nenhum app foi editado nos últimos 7 dias.';

    return (
      <>
        <View style={studioStyles.homeHeader}>
          {buscaAberta ? (
            <View style={studioStyles.homeBuscaPilula}>
              <MaterialCommunityIcons name="magnify" size={20} color={COLORS.dim} />
              <TextInput
                style={studioStyles.buscaInput}
                value={buscaProjeto}
                onChangeText={setBuscaProjeto}
                placeholder="Buscar app..."
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
              <View style={{ flex: 1 }}>
                <Text style={studioStyles.homeOverline}>CINDRA-STUDIO</Text>
                <Text style={studioStyles.homeTitulo} numberOfLines={1}>Meus apps</Text>
              </View>
              <TouchableOpacity
                style={studioStyles.homeIconBtn}
                onPress={() => exibirAviso('Em breve', 'As notificações ainda não estão disponíveis.', 'aviso')}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="bell-outline" size={22} color={COLORS.ink} />
              </TouchableOpacity>
              <BotaoContaNuvem nome={contaNuvem ? contaNuvem.nome : null} status={statusNuvem} onPress={tocarBolinhaConta} />
              {listaProjetos.length > 0 && (
                <TouchableOpacity style={studioStyles.homeIconBtn} onPress={() => setBuscaAberta(true)} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="magnify" size={22} color={COLORS.ink} />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {listaProjetos.length === 0 ? (
          <View style={studioStyles.homeVazio}>
            <View style={studioStyles.homeVazioIcone}>
              <MaterialCommunityIcons name="rocket-launch-outline" size={38} color={COLORS.ember} />
            </View>
            <Text style={studioStyles.homeVazioTitulo}>Comece seu primeiro app</Text>
            <Text style={studioStyles.homeVazioTexto}>
              Crie um projeto Android, edite o código e gere o APK direto do celular.
            </Text>
            <TouchableOpacity style={studioStyles.vazioBtn} onPress={abrirTelaConfigNova} activeOpacity={0.85}>
              <Grad />
              <MaterialCommunityIcons name="plus" size={22} color="#ffffff" />
              <Text style={studioStyles.vazioBtnText}>Criar app</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
          >
            {!buscando && ultimoProjeto && renderHero()}

            {!buscando && (
              <View style={studioStyles.tilesLinha}>
                {renderTileFiltro('todos', 'cube-outline', listaProjetos.length, 'Apps')}
                {renderTileFiltro('favoritos', 'star-outline', totalFavoritos, 'Favoritos')}
                {renderTileFiltro('semana', 'clock-outline', totalSemana, 'Esta semana')}
              </View>
            )}

            <View style={studioStyles.secaoLinha}>
              <Text style={studioStyles.secaoTitulo}>
                {rotuloSecao}  <Text style={studioStyles.secaoContagem}>{listaExibida.length}</Text>
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity style={studioStyles.ordemPilula} onPress={() => setMenuOrdenarAberto(true)} activeOpacity={0.8}>
                  <MaterialCommunityIcons name="swap-vertical" size={16} color={COLORS.ink} />
                  <Text style={studioStyles.ordemTexto}>{ROTULOS_ORDEM_STUDIO[ordenacao]}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={studioStyles.modoBtn} onPress={alternarModoLista} activeOpacity={0.8}>
                  <MaterialCommunityIcons
                    name={modoLista === 'grade' ? 'format-list-bulleted' : 'view-grid-outline'}
                    size={20}
                    color={COLORS.ink}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {!buscando && avisoRecuperarVisivel && (
              <View style={studioStyles.avisoCard}>
                <MaterialCommunityIcons name="history" size={22} color="#d9a2ff" />
                <Text style={studioStyles.avisoTexto}>Tem projetos de uma versão anterior? Eles podem ser recuperados.</Text>
                <TouchableOpacity onPress={dispensarAvisoRecuperar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={studioStyles.avisoBtnText}>Dispensar</Text>
                </TouchableOpacity>
              </View>
            )}

            {listaExibida.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20 }}>
                <MaterialCommunityIcons name={buscando ? 'magnify-close' : 'folder-outline'} size={34} color={COLORS.dim} />
                <Text style={[studioStyles.homeVazioTexto, { marginTop: 12 }]}>{msgVazia}</Text>
              </View>
            ) : modoLista === 'grade' ? (
              <View style={studioStyles.gradeWrap}>{listaExibida.map(renderCardGrade)}</View>
            ) : (
              listaExibida.map(renderCardLista)
            )}

            {!buscando && (
              <TouchableOpacity style={studioStyles.apoioCard} onPress={abrirLinkApoio} activeOpacity={0.85}>
                <View style={studioStyles.apoioTag}>
                  <Text style={studioStyles.apoioTagTexto}>Comunidade</Text>
                </View>
                <View style={studioStyles.apoioLinha}>
                  <View style={studioStyles.apoioIcone}>
                    <MaterialCommunityIcons name="heart" size={26} color={COLORS.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={studioStyles.apoioTitulo} numberOfLines={1}>Curtiu o CindraStudio?</Text>
                    <Text style={studioStyles.apoioSub} numberOfLines={2}>Ajude a Cindra a crescer com o seu apoio.</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.dim} />
                </View>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </>
    );
  };

  // Aba "Aprender": exemplos de código. Toca num botão, o código aparece
  // logo embaixo, com botão de copiar em cada bloco.
  const copiarBloco = async (chave, codigo) => {
    const r = await copiarTextoStudio(codigo);
    if (r === 'copiado') {
      setCopiadoChave(chave);
      setTimeout(() => setCopiadoChave((atual) => (atual === chave ? null : atual)), 2000);
    } else if (r === 'compartilhado') {
      exibirAviso('Toque em "Copiar"', 'No menu que abriu, escolha Copiar pra guardar o código.', 'aviso');
    } else {
      exibirAviso('Não deu pra copiar', 'Segure o dedo em cima do código pra selecionar e copiar.', 'erro');
    }
  };

  const renderPainelExemplo = (item) => {
    const temMain = item.blocos.some((b) => b.rotulo.indexOf('MainActivity') !== -1);
    return (
      <View key={`painel-${item.id}`} style={aprenderStyles.painel}>
        <Text style={aprenderStyles.painelTitulo}>{item.titulo}</Text>
        <Text style={aprenderStyles.painelDesc}>{item.descricao}</Text>
        {temMain && <Text style={aprenderStyles.painelDica}>{AVISO_PACKAGE}</Text>}
        {item.blocos.map((bloco, i) => {
          const chave = `${item.id}:${i}`;
          const copiado = copiadoChave === chave;
          return (
            <View key={chave}>
              <View style={aprenderStyles.blocoCab}>
                <Text style={aprenderStyles.blocoRotulo}>{bloco.rotulo}</Text>
                <TouchableOpacity
                  style={[aprenderStyles.copiarBtn, copiado && aprenderStyles.copiarBtnOk]}
                  onPress={() => copiarBloco(chave, bloco.codigo)}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name={copiado ? 'check' : 'content-copy'} size={16} color="#ffffff" />
                  <Text style={aprenderStyles.copiarTexto}>{copiado ? 'Copiado!' : 'Copiar'}</Text>
                </TouchableOpacity>
              </View>
              <View style={aprenderStyles.codigoCaixa}>
                <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
                  <Text selectable style={aprenderStyles.codigoTexto}>{bloco.codigo}</Text>
                </ScrollView>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  // Aba "Gerados": um cartão por app compilado; a setinha abre todos os
  // APKs já gerados dele (ícone, versão, tipo, data e tamanho). Dá pra
  // apagar um a um (lixeira), todos de um app, ou vários de uma vez no modo
  // de seleção (botão do topo ou segurando o dedo num APK).
  const renderAbaGerados = () => {
    const grupos = agruparBuildsStudio(builds);
    const qtdSel = Object.keys(selecionadosBuilds).length;
    return (
      <>
        <View style={studioStyles.homeHeader}>
          <View style={{ flex: 1 }}>
            <Text style={studioStyles.homeOverline}>CINDRA-STUDIO</Text>
            <Text style={studioStyles.homeTitulo} numberOfLines={1}>
              {modoSelecaoBuilds ? (qtdSel ? `${qtdSel} selecionado${qtdSel > 1 ? 's' : ''}` : 'Selecionar APKs') : 'Apps gerados'}
            </Text>
            {grupos.length > 0 && !modoSelecaoBuilds && (
              <Text style={geradosStyles.resumo}>
                {grupos.length} {grupos.length === 1 ? 'app' : 'apps'} · {builds.length} {builds.length === 1 ? 'APK' : 'APKs'}
              </Text>
            )}
          </View>
          {grupos.length > 0 && !modoSelecaoBuilds && (
            <TouchableOpacity style={studioStyles.homeIconBtn} onPress={copiarTodosParaPublica} activeOpacity={0.8}>
              {copiandoPublica ? (
                <ActivityIndicator size="small" color={COLORS.ink} />
              ) : (
                <MaterialCommunityIcons name="folder-download-outline" size={22} color={COLORS.ink} />
              )}
            </TouchableOpacity>
          )}
          {grupos.length > 0 && (
            <TouchableOpacity
              style={studioStyles.homeIconBtn}
              onPress={() => (modoSelecaoBuilds ? sairSelecaoBuilds() : iniciarSelecaoBuilds(null))}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={modoSelecaoBuilds ? 'close' : 'checkbox-multiple-marked-outline'}
                size={22}
                color={COLORS.ink}
              />
            </TouchableOpacity>
          )}
        </View>
        {grupos.length === 0 ? (
          <View style={geradosStyles.vazio}>
            <View style={geradosStyles.vazioIcone}>
              <MaterialCommunityIcons name="package-variant-closed" size={36} color={COLORS.ember} />
            </View>
            <Text style={studioStyles.homeVazioTitulo}>Nenhum APK gerado ainda</Text>
            <Text style={studioStyles.homeVazioTexto}>
              Abra um app e toque em ▶ pra compilar. Cada APK gerado aparece aqui, agrupado por app.
            </Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={geradosStyles.lista} showsVerticalScrollIndicator={false}>
            {grupos.map((g, i) => {
              const aberto = modoSelecaoBuilds || !!gruposAbertos[g.pacote];
              const qtdGrupoSel = g.itens.filter((b) => selecionadosBuilds[b.id]).length;
              const grupoTodoSel = qtdGrupoSel === g.itens.length;
              const grupoArmado = confirmarApagarGrupo === g.pacote;
              return (
                <ItemAnimadoStudio key={g.pacote} indice={i}>
                  <View style={geradosStyles.grupo}>
                    <TouchableOpacity
                      style={geradosStyles.grupoTopo}
                      activeOpacity={0.8}
                      onPress={() => {
                        if (modoSelecaoBuilds) {
                          // toca no app inteiro: marca/desmarca todos os APKs dele
                          setConfirmarApagarLote(false);
                          setSelecionadosBuilds((a) => {
                            const n = { ...a };
                            g.itens.forEach((b) => { if (grupoTodoSel) delete n[b.id]; else n[b.id] = true; });
                            return n;
                          });
                        } else {
                          setConfirmarApagarGrupo(null);
                          setGruposAbertos((a) => ({ ...a, [g.pacote]: !a[g.pacote] }));
                        }
                      }}
                    >
                      <IconeAppStudio dados={g.icone} lado={42} icone={22} raio={12} />
                      <View style={{ flex: 1 }}>
                        <Text style={geradosStyles.grupoNome} numberOfLines={1}>{g.ultimo.nomeApp}</Text>
                        <Text style={geradosStyles.grupoPacote} numberOfLines={1}>{g.pacote}</Text>
                        <View style={geradosStyles.grupoMeta}>
                          <View style={geradosStyles.grupoBadge}>
                            <Text style={geradosStyles.grupoBadgeTexto}>{g.itens.length} {g.itens.length === 1 ? 'APK' : 'APKs'}</Text>
                          </View>
                          <Text style={geradosStyles.grupoData} numberOfLines={1}>{formatarDataBuildStudio(g.ultimo.criadoEm)}</Text>
                        </View>
                      </View>
                      <View style={geradosStyles.seta}>
                        {modoSelecaoBuilds ? (
                          <MaterialCommunityIcons
                            name={grupoTodoSel ? 'checkbox-multiple-marked' : qtdGrupoSel ? 'minus-box-multiple' : 'checkbox-multiple-blank-outline'}
                            size={16}
                            color={qtdGrupoSel ? COLORS.ember : COLORS.dim}
                          />
                        ) : (
                          <MaterialCommunityIcons name={aberto ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.ink} />
                        )}
                      </View>
                    </TouchableOpacity>

                    {aberto && (
                      <View style={geradosStyles.buildsWrap}>
                        {g.itens.map((b) => {
                          const armado = confirmarApagarBuild === b.id;
                          const ehRelease = b.tipo === 'release';
                          const marcado = !!selecionadosBuilds[b.id];
                          return (
                            <TouchableOpacity
                              key={b.id}
                              style={[geradosStyles.buildLinha, marcado && { backgroundColor: 'rgba(180,60,255,0.10)' }]}
                              activeOpacity={modoSelecaoBuilds ? 0.7 : 1}
                              onPress={() => { if (modoSelecaoBuilds) alternarSelecaoBuild(b.id); }}
                              onLongPress={() => { if (!modoSelecaoBuilds) iniciarSelecaoBuilds(b.id); }}
                              delayLongPress={350}
                            >
                              {modoSelecaoBuilds && (
                                <MaterialCommunityIcons
                                  name={marcado ? 'checkbox-marked' : 'checkbox-blank-outline'}
                                  size={22}
                                  color={marcado ? COLORS.ember : COLORS.dim}
                                />
                              )}
                              <IconeAppStudio dados={b} lado={32} icone={18} raio={10} />
                              <View style={{ flex: 1 }}>
                                <Text style={geradosStyles.buildTitulo} numberOfLines={1}>
                                  {b.versaoNome ? `v${b.versaoNome}` : 'APK'}{b.versaoCodigo ? ` (${b.versaoCodigo})` : ''}
                                  {'  '}
                                  <Text style={[geradosStyles.buildTipo, { color: ehRelease ? '#8bd450' : COLORS.gold }]}>
                                    {ehRelease ? 'RELEASE' : 'DEBUG'}
                                  </Text>
                                </Text>
                                <Text style={geradosStyles.buildData} numberOfLines={1}>
                                  {formatarDataBuildStudio(b.criadoEm)}{b.tamanho ? `  ·  ${formatarTamanhoStudio(b.tamanho)}` : ''}{b.apkPublico ? '  ·  cindra-studio' : ''}
                                </Text>
                              </View>
                              {!modoSelecaoBuilds && (
                                <>
                                  <TouchableOpacity style={geradosStyles.buildAcao} onPress={() => instalarBuild(b)} activeOpacity={0.8}>
                                    <MaterialCommunityIcons name="cellphone-arrow-down" size={17} color="#8bd450" />
                                  </TouchableOpacity>
                                  <TouchableOpacity style={geradosStyles.buildAcao} onPress={() => compartilharApk(b.apk, b.nomeApp)} activeOpacity={0.8}>
                                    <MaterialCommunityIcons name="share-variant-outline" size={17} color={COLORS.ink} />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[geradosStyles.buildAcao, armado && { backgroundColor: COLORS.error }]}
                                    onPress={() => tocarLixeiraBuild(b)}
                                    activeOpacity={0.8}
                                  >
                                    <MaterialCommunityIcons name={armado ? 'check' : 'trash-can-outline'} size={17} color={armado ? '#ffffff' : COLORS.error} />
                                  </TouchableOpacity>
                                </>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                        {!modoSelecaoBuilds && (
                          <TouchableOpacity style={geradosStyles.apagarGrupo} onPress={() => tocarApagarGrupo(g)} activeOpacity={0.8}>
                            <MaterialCommunityIcons name="delete-sweep-outline" size={16} color={COLORS.error} />
                            <Text style={geradosStyles.apagarGrupoTexto}>
                              {grupoArmado
                                ? `Toque de novo pra apagar ${g.itens.length} ${g.itens.length === 1 ? 'APK' : 'APKs'}`
                                : 'Apagar todos deste app'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </ItemAnimadoStudio>
              );
            })}
          </ScrollView>
        )}

        {modoSelecaoBuilds && (
          <View style={geradosStyles.barraSelecao}>
            <TouchableOpacity style={geradosStyles.barraBtn} onPress={selecionarTodosBuilds} activeOpacity={0.8}>
              <MaterialCommunityIcons
                name={builds.length > 0 && qtdSel === builds.length ? 'checkbox-multiple-marked' : 'checkbox-multiple-blank-outline'}
                size={18}
                color={COLORS.ink}
              />
              <Text style={geradosStyles.barraBtnTexto}>Todos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                geradosStyles.barraApagar,
                !qtdSel && { opacity: 0.4 },
                confirmarApagarLote && { backgroundColor: COLORS.error },
              ]}
              onPress={apagarSelecionadosBuilds}
              disabled={!qtdSel}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#ffffff" />
              <Text style={geradosStyles.barraApagarTexto} numberOfLines={1}>
                {confirmarApagarLote ? `Confirmar: apagar ${qtdSel}` : qtdSel ? `Apagar ${qtdSel}` : 'Apagar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
  };

  const renderAbaAprender = () => {
    const termo = semAcentoStudio(buscaAprender.trim());
    const categoriasVisiveis = EXEMPLOS_APRENDER
      .map((cat) => ({
        ...cat,
        itens: termo
          ? cat.itens.filter((item) =>
              semAcentoStudio(`${item.titulo} ${item.descricao} ${item.id} ${cat.categoria}`).includes(termo))
          : cat.itens,
      }))
      .filter((cat) => cat.itens.length > 0);
    const totalExemplos = EXEMPLOS_APRENDER.reduce((n, cat) => n + cat.itens.length, 0);
    const totalAchados = categoriasVisiveis.reduce((n, cat) => n + cat.itens.length, 0);
    const fecharBuscaAprender = () => { setBuscaAprenderAberta(false); setBuscaAprender(''); };

    return (
      <>
        <View style={studioStyles.homeHeader}>
          {buscaAprenderAberta ? (
            <View style={studioStyles.homeBuscaPilula}>
              <MaterialCommunityIcons name="magnify" size={20} color={COLORS.dim} />
              <TextInput
                style={studioStyles.buscaInput}
                value={buscaAprender}
                onChangeText={setBuscaAprender}
                placeholder="Buscar exemplo..."
                placeholderTextColor={COLORS.dim}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity onPress={fecharBuscaAprender} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={20} color={COLORS.ink} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <Text style={studioStyles.homeOverline}>CINDRA-STUDIO</Text>
                <Text style={studioStyles.homeTitulo} numberOfLines={1}>Aprender</Text>
              </View>
              <TouchableOpacity style={studioStyles.homeIconBtn} onPress={() => setBuscaAprenderAberta(true)} activeOpacity={0.8}>
                <MaterialCommunityIcons name="magnify" size={22} color={COLORS.ink} />
              </TouchableOpacity>
            </>
          )}
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
        >
          <Text style={aprenderStyles.intro}>
            {termo
              ? `${totalAchados} ${totalAchados === 1 ? 'exemplo encontrado' : 'exemplos encontrados'} para "${buscaAprender.trim()}".`
              : `${totalExemplos} exemplos. Toque num pra ver o código, depois é só copiar e colar no seu projeto.`}
          </Text>

          {categoriasVisiveis.length === 0 && (
            <Text style={[aprenderStyles.intro, { textAlign: 'center', marginTop: 30 }]}>
              Nenhum exemplo encontrado. Tente outra palavra, como "botão", "som" ou "internet".
            </Text>
          )}

          {categoriasVisiveis.map((cat) => (
            <View key={cat.categoria}>
              <View style={aprenderStyles.catLinha}>
                <MaterialCommunityIcons name={cat.icone} size={20} color={COLORS.ember} />
                <Text style={aprenderStyles.catTitulo}>{cat.categoria}</Text>
              </View>
              <View style={aprenderStyles.chips}>
                {cat.itens.map((item) => {
                  const ativo = exemploAberto === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[aprenderStyles.chip, ativo && aprenderStyles.chipAtivo]}
                      onPress={() => setExemploAberto(ativo ? null : item.id)}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name={item.icone} size={16} color={ativo ? '#d9a2ff' : COLORS.dim} />
                      <Text style={[aprenderStyles.chipTexto, ativo && aprenderStyles.chipTextoAtivo]}>{item.titulo}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {cat.itens.map((item) => (exemploAberto === item.id ? renderPainelExemplo(item) : null))}
            </View>
          ))}
        </ScrollView>
      </>
    );
  };

  // Aba "Publicar": cada app gerado com o último APK. Publicado → link + apagar; senão → botão Publicar.
  const renderAbaPublicar = () => {
    const grupos = agruparBuildsStudio(builds);
    const usados = publicados.length;
    const limiteCheio = usados >= LIMITE_PUBLICADOS_STUDIO;
    return (
      <>
        <View style={studioStyles.homeHeader}>
          <View style={{ flex: 1 }}>
            <Text style={studioStyles.homeOverline}>CINDRA-STUDIO</Text>
            <Text style={studioStyles.homeTitulo} numberOfLines={1}>Publicar</Text>
            {!!contaNuvem && (
              <Text style={geradosStyles.resumo}>{usados}/{LIMITE_PUBLICADOS_STUDIO} apps publicados</Text>
            )}
          </View>
          {!!contaNuvem && (
            <TouchableOpacity style={studioStyles.homeIconBtn} onPress={carregarPublicados} activeOpacity={0.8}>
              {carregandoPublicados ? (
                <ActivityIndicator size="small" color={COLORS.ink} />
              ) : (
                <MaterialCommunityIcons name="refresh" size={22} color={COLORS.ink} />
              )}
            </TouchableOpacity>
          )}
        </View>

        {!contaNuvem ? (
          <View style={geradosStyles.vazio}>
            <View style={geradosStyles.vazioIcone}>
              <MaterialCommunityIcons name="account-lock-outline" size={36} color={COLORS.ember} />
            </View>
            <Text style={studioStyles.homeVazioTitulo}>Entre na sua conta</Text>
            <Text style={studioStyles.homeVazioTexto}>
              O link de download só funciona com conta. Entre pra publicar até {LIMITE_PUBLICADOS_STUDIO} apps.
            </Text>
            <TouchableOpacity style={[geradosStyles.pubBtn, { marginTop: 16, height: 40, paddingHorizontal: 22 }]} onPress={() => setLoginNuvem('manual')} activeOpacity={0.85}>
              <Text style={geradosStyles.pubBtnTexto}>Entrar</Text>
            </TouchableOpacity>
          </View>
        ) : grupos.length === 0 ? (
          <View style={geradosStyles.vazio}>
            <View style={geradosStyles.vazioIcone}>
              <MaterialCommunityIcons name="rocket-launch-outline" size={36} color={COLORS.ember} />
            </View>
            <Text style={studioStyles.homeVazioTitulo}>Nada pra publicar ainda</Text>
            <Text style={studioStyles.homeVazioTexto}>
              Abra um app e toque em ▶ pra compilar. O último APK de cada app aparece aqui pra você publicar.
            </Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={geradosStyles.lista} showsVerticalScrollIndicator={false}>
            {!!erroPublicados && (
              <Text style={{ color: COLORS.error, fontSize: 12, marginBottom: 10 }}>{erroPublicados}</Text>
            )}
            {grupos.map((g, i) => {
              const pub = publicados.find((p) => p.pacote === g.pacote);
              const enviando = publicandoPacote === g.pacote;
              const apagando = !!pub && apagandoSlug === pub.slug;
              const b = g.ultimo;
              const bloqueado = !pub && limiteCheio;
              return (
                <ItemAnimadoStudio key={g.pacote} indice={i}>
                  <View style={geradosStyles.grupo}>
                    <View style={geradosStyles.grupoTopo}>
                      <IconeAppStudio dados={g.icone} lado={42} icone={22} raio={12} />
                      <View style={{ flex: 1 }}>
                        <Text style={geradosStyles.grupoNome} numberOfLines={1}>{b.nomeApp}</Text>
                        <Text style={geradosStyles.pubInfo} numberOfLines={1}>
                          Último APK: {b.versaoNome ? `v${b.versaoNome}` : 'APK'} · {formatarDataBuildStudio(b.criadoEm)}{b.tamanho ? ` · ${formatarTamanhoStudio(b.tamanho)}` : ''}
                        </Text>
                        {pub && (
                          <View style={geradosStyles.pubLinkLinha}>
                            <TouchableOpacity style={{ flex: 1 }} onPress={() => abrirLinkPublicado(pub.url)} activeOpacity={0.7}>
                              <Text style={geradosStyles.pubLink} numberOfLines={1}>{String(pub.url).replace(/^https:\/\//, '')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={geradosStyles.pubBtnIcone} onPress={() => publicarGrupo(g)} disabled={!!publicandoPacote} activeOpacity={0.8}>
                              {enviando ? (
                                <ActivityIndicator size="small" color={COLORS.ink} />
                              ) : (
                                <MaterialCommunityIcons name="cloud-upload-outline" size={18} color={COLORS.ink} />
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity style={[geradosStyles.pubBtn, geradosStyles.pubBtnApagar]} onPress={() => apagarLinkPublicado(pub)} disabled={apagando} activeOpacity={0.8}>
                              {apagando ? (
                                <ActivityIndicator size="small" color="#ff8a80" />
                              ) : (
                                <Text style={geradosStyles.pubBtnApagarTexto}>Apagar</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      {!pub && (
                        <TouchableOpacity
                          style={[geradosStyles.pubBtn, bloqueado && geradosStyles.pubBtnInativo]}
                          onPress={() => publicarGrupo(g)}
                          disabled={!!publicandoPacote}
                          activeOpacity={0.85}
                        >
                          {enviando ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={[geradosStyles.pubBtnTexto, bloqueado && { color: COLORS.dim }]}>Publicar</Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </ItemAnimadoStudio>
              );
            })}
          </ScrollView>
        )}
      </>
    );
  };

  // Barra de baixo: "Meus apps", "Aprender" e o botão "Criar".
  const renderNavHome = () => (
    <View style={[studioStyles.navHome, { paddingBottom: Math.max(insets.bottom, 8) + 6 }]}>
      {ABAS_HOME_STUDIO.map((a) => {
        if (a.especial) {
          return (
            <TouchableOpacity key={a.id} style={studioStyles.navBotaoCriar} onPress={abrirTelaConfigNova} activeOpacity={0.85}>
              <Grad />
              <MaterialCommunityIcons name="plus" size={20} color="#ffffff" />
              <Text style={studioStyles.navBotaoCriarTexto} numberOfLines={1}>{a.rotulo}</Text>
            </TouchableOpacity>
          );
        }
        const ativo = abaHome === a.id;
        return (
          <TouchableOpacity key={a.id} style={[studioStyles.navAba, ativo && studioStyles.navAbaAtiva]} onPress={() => setAbaHome(a.id)} activeOpacity={0.8}>
            <MaterialCommunityIcons
              name={ativo ? a.iconeAtivo : a.icone}
              size={20}
              color={ativo ? '#d9a2ff' : COLORS.dim}
            />
            <Text style={[studioStyles.navAbaTexto, ativo && studioStyles.navAbaTextoAtivo]} numberOfLines={1}>{a.rotulo}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderHome = () => (
    <>

      <EntradaAleatoria key={abaHome} animar={trocouAba} style={{ flex: 1 }}>
        {abaHome === 'aprender' ? renderAbaAprender() : abaHome === 'gerados' ? renderAbaGerados() : abaHome === 'publicar' ? renderAbaPublicar() : renderAbaApps()}
      </EntradaAleatoria>

      {renderNavHome()}

      {menuOrdenarAberto && (
        <FolhaInferiorStudio onFechar={() => setMenuOrdenarAberto(false)} insetBottom={insets.bottom}>
          {(fechar) => (
            <>
              <Text style={[studioStyles.folhaTitulo, { marginBottom: 14 }]}>Ordenar por</Text>
              {Object.keys(ROTULOS_ORDEM_STUDIO).map((id) => {
                const ativo = ordenacao === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={studioStyles.folhaLinha}
                    onPress={() => { escolherOrdenacao(id); fechar(); }}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name={ICONES_ORDEM_STUDIO[id]} size={20} color={ativo ? COLORS.ember : COLORS.dim} />
                    <Text style={[studioStyles.folhaLinhaTexto, ativo && { color: COLORS.ember }]}>{ROTULOS_ORDEM_STUDIO[id]}</Text>
                    {ativo && <MaterialCommunityIcons name="check" size={20} color={COLORS.ember} />}
                  </TouchableOpacity>
                );
              })}
              <View style={studioStyles.folhaLinha}>
                <MaterialCommunityIcons name="star-outline" size={20} color={COLORS.gold} />
                <Text style={studioStyles.folhaLinhaTexto}>Favoritos primeiro</Text>
                <Switch
                  value={favoritosNoTopo}
                  onValueChange={alternarFavoritosNoTopo}
                  trackColor={{ false: 'rgba(255,255,255,0.15)', true: COLORS.ember }}
                  thumbColor="#ffffff"
                />
              </View>
            </>
          )}
        </FolhaInferiorStudio>
      )}

      {confirmarSaida && (
        <FolhaInferiorStudio onFechar={() => setConfirmarSaida(false)} insetBottom={insets.bottom}>
          {(fechar) => (
            <>
              <Text style={[studioStyles.folhaTitulo, { marginBottom: 8 }]}>Sair do app?</Text>
              <Text style={{ color: COLORS.dim, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
                Você tem certeza que quer sair?
              </Text>
              <View style={studioStyles.folhaConfirmaBotoes}>
                <TouchableOpacity style={studioStyles.folhaBtn} onPress={fechar} activeOpacity={0.8}>
                  <Text style={studioStyles.folhaBtnTexto}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[studioStyles.folhaBtn, studioStyles.folhaBtnPerigo]}
                  onPress={() => BackHandler.exitApp()}
                  activeOpacity={0.85}
                >
                  <Text style={[studioStyles.folhaBtnTexto, { color: '#ffffff' }]}>Sair</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </FolhaInferiorStudio>
      )}

      <LoginNuvemModal
        visible={!!loginNuvem}
        convite={loginNuvem === 'convite'}
        onFechar={fecharLoginNuvem}
        onSucesso={aoLogarNuvem}
      />
      <ContaNuvemModal
        visible={contaNuvemAberta && !!contaNuvem}
        nome={contaNuvem ? contaNuvem.nome : ''}
        status={statusNuvem}
        ultima={ultimaSyncNuvem}
        totalProjetos={listaProjetos.length}
        onFechar={() => setContaNuvemAberta(false)}
        onSincronizar={() => { agendarSyncNuvem(0); }}
        onSair={sairDaNuvem}
      />

      {pedirAcessoArquivos && (
        <FolhaInferiorStudio
          onFechar={() => { pedidoRecusadoRef.current = true; setPedirAcessoArquivos(false); }}
          insetBottom={insets.bottom}
        >
          {(fechar) => (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <View style={geradosStyles.vazioIcone}>
                  <MaterialCommunityIcons name="folder-key-outline" size={34} color={COLORS.ember} />
                </View>
                <Text style={[studioStyles.folhaTitulo, { flex: 1 }]}>Liberar acesso aos arquivos</Text>
              </View>
              <Text style={{ color: COLORS.dim, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
                Pra salvar seus APKs em {PASTA_PUBLICA_TEXTO} (a pasta é criada sozinha), ative "Permitir acesso para gerenciar todos os arquivos" pro Cindra Studio na tela que vai abrir.
              </Text>
              <View style={studioStyles.folhaConfirmaBotoes}>
                <TouchableOpacity style={studioStyles.folhaBtn} onPress={fechar} activeOpacity={0.8}>
                  <Text style={studioStyles.folhaBtnTexto}>Agora não</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[studioStyles.folhaBtn, { backgroundColor: COLORS.ember }]}
                  onPress={() => { abrirConfigAcessoArquivos(); }}
                  activeOpacity={0.85}
                >
                  <Text style={[studioStyles.folhaBtnTexto, { color: '#ffffff' }]}>Liberar</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                disabled={verificandoAcessoArquivos}
                onPress={async () => {
                  setVerificandoAcessoArquivos(true);
                  const ok = await verificarAcessoPastaPublica(false);
                  setVerificandoAcessoArquivos(false);
                  if (!ok) {
                    exibirAviso(
                      'Ainda sem acesso',
                      'Na tela de Configurações, procure o Cindra Studio na lista e ATIVE a chave "Permitir acesso para gerenciar todos os arquivos" — só abrir a tela não libera, precisa ligar a chave.',
                      'aviso'
                    );
                  }
                }}
                activeOpacity={0.7}
                style={{ alignSelf: 'center', marginTop: 14, padding: 6 }}
              >
                <Text style={{ color: COLORS.dim, fontSize: 13, textDecorationLine: 'underline' }}>
                  {verificandoAcessoArquivos ? 'Verificando…' : 'Já liberei, verificar de novo'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </FolhaInferiorStudio>
      )}

      {cardProjeto && (
        <FolhaInferiorStudio onFechar={() => setCardProjeto(null)} insetBottom={alturaTeclado > 0 ? alturaTeclado + 12 : insets.bottom}>
          {(fechar) => (
            <ConteudoFolhaProjeto
              projeto={cardProjeto}
              onAbrir={() => { const pacote = cardProjeto.pacote; setCardProjeto(null); abrirProjetoDaLista(pacote); }}
              onFavoritar={() => { alternarFavoritoProjeto(cardProjeto.pacote); fechar(); }}
              onExcluir={() => excluirProjetoDaLista(cardProjeto.pacote)}
              onLerVersao={() => lerVersaoDaLista(cardProjeto.pacote)}
              onSalvarVersao={(n, c) => salvarVersaoDaLista(cardProjeto.pacote, n, c)}
              onCancelar={fechar}
            />
          )}
        </FolhaInferiorStudio>
      )}
    </>
  );

  // ---------- Tela 1: configuração do projeto ----------
  const renderConfig = () => (
    <View style={{ flex: 1 }}>
      <View style={[styles.chatHeader, { paddingTop: 10 }]}>
        <TouchableOpacity onPress={() => setEtapa('home')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={COLORS.ink} />
        </TouchableOpacity>
        <Text style={styles.chatHeaderTitle}>Novo app</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Ícone grande: toque pra escolher a foto da galeria */}
        <View style={studioStyles.cfgHero}>
          <TouchableOpacity activeOpacity={0.85} onPress={escolherFotoIcone} style={studioStyles.cfgIconeWrap}>
            {fotoIcone ? (
              <Image source={{ uri: fotoIcone }} style={studioStyles.cfgIconeFoto} />
            ) : (
              <View style={[studioStyles.cfgIconeBase, { backgroundColor: hexParaRgba(corIcone, 0.16), borderColor: hexParaRgba(corIcone, 0.5) }]}>
                <MaterialCommunityIcons name="android" size={58} color={corIcone} />
              </View>
            )}
            <View style={studioStyles.cfgIconeBadge}>
              {processandoFoto
                ? <ActivityIndicator size="small" color="#ffffff" />
                : <MaterialCommunityIcons name="camera-plus-outline" size={17} color="#ffffff" />}
            </View>
          </TouchableOpacity>
          <Text style={studioStyles.previewName} numberOfLines={1}>{nomeApp.trim() || 'Meu App'}</Text>
          <Text style={studioStyles.previewPkg} numberOfLines={1}>{nomePacote.trim() || 'com.dev.meuapp'}</Text>
        </View>

        {/* Dados do app */}
        <View style={studioStyles.cfgCard}>
          <Text style={[studioStyles.cfgLabel, { marginTop: 0 }]}>Nome do app</Text>
          <View style={[studioStyles.cfgCampo, campoFoco === 'nome' && studioStyles.cfgCampoFoco]}>
            <MaterialCommunityIcons name="application-outline" size={18} color={campoFoco === 'nome' ? COLORS.ember : COLORS.dim} />
            <TextInput
              style={studioStyles.cfgCampoInput}
              value={nomeApp}
              onChangeText={setNomeApp}
              onFocus={() => setCampoFoco('nome')}
              onBlur={() => setCampoFoco(null)}
              placeholder="Ex: Abismo de Lumen"
              placeholderTextColor={COLORS.dim}
            />
          </View>

          <Text style={studioStyles.cfgLabel}>Nome do pacote</Text>
          <View style={[studioStyles.cfgCampo, campoFoco === 'pacote' && studioStyles.cfgCampoFoco]}>
            <MaterialCommunityIcons name="package-variant-closed" size={18} color={campoFoco === 'pacote' ? COLORS.ember : COLORS.dim} />
            <TextInput
              style={studioStyles.cfgCampoInput}
              value={nomePacote}
              onChangeText={setNomePacote}
              onFocus={() => setCampoFoco('pacote')}
              onBlur={() => setCampoFoco(null)}
              placeholder="com.seunome.appname"
              placeholderTextColor={COLORS.dim}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Text style={studioStyles.cfgHint}>Identificador único do app (convenção: com.seunome.nomedoapp). Evite espaços e acentos.</Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1.4 }}>
              <Text style={studioStyles.cfgLabel}>Versão</Text>
              <View style={[studioStyles.cfgCampo, campoFoco === 'versao' && studioStyles.cfgCampoFoco]}>
                <MaterialCommunityIcons name="tag-outline" size={18} color={campoFoco === 'versao' ? COLORS.ember : COLORS.dim} />
                <TextInput
                  style={studioStyles.cfgCampoInput}
                  value={versaoNomeNovo}
                  onChangeText={(t) => setVersaoNomeNovo(t.replace(/[^0-9A-Za-z._+-]/g, ''))}
                  onFocus={() => setCampoFoco('versao')}
                  onBlur={() => setCampoFoco(null)}
                  placeholder="1.0"
                  placeholderTextColor={COLORS.dim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={studioStyles.cfgLabel}>Código</Text>
              <View style={[studioStyles.cfgCampo, campoFoco === 'codigo' && studioStyles.cfgCampoFoco]}>
                <MaterialCommunityIcons name="pound" size={18} color={campoFoco === 'codigo' ? COLORS.ember : COLORS.dim} />
                <TextInput
                  style={studioStyles.cfgCampoInput}
                  value={versaoCodigoNovo}
                  onChangeText={(t) => setVersaoCodigoNovo(t.replace(/\D/g, ''))}
                  onFocus={() => setCampoFoco('codigo')}
                  onBlur={() => setCampoFoco(null)}
                  placeholder="1"
                  placeholderTextColor={COLORS.dim}
                  keyboardType="number-pad"
                  maxLength={9}
                />
              </View>
            </View>
          </View>
          <Text style={studioStyles.cfgHint}>Versão é o que aparece pra quem instala (ex.: 1.0). O código é um número que só sobe a cada atualização.</Text>
        </View>

        {/* Ícone */}
        <View style={studioStyles.cfgCard}>
          <Text style={[studioStyles.cfgLabel, { marginTop: 0 }]}>Ícone do app</Text>
          <View style={studioStyles.cfgBtnRow}>
            <TouchableOpacity style={studioStyles.cfgBtnPrimario} onPress={escolherFotoIcone} activeOpacity={0.85} disabled={processandoFoto}>
              <MaterialCommunityIcons name="image-multiple-outline" size={18} color={COLORS.ember} />
              <Text style={studioStyles.cfgBtnPrimarioTexto}>{fotoIcone ? 'Trocar foto' : 'Escolher da galeria'}</Text>
            </TouchableOpacity>
            {!!fotoIcone && (
              <TouchableOpacity style={studioStyles.cfgBtnSecundario} onPress={() => setFotoIcone(null)} activeOpacity={0.85}>
                <MaterialCommunityIcons name="android" size={18} color={COLORS.ink} />
                <Text style={studioStyles.cfgBtnSecundarioTexto}>Usar Android</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={studioStyles.cfgHint}>
            {fotoIcone
              ? 'Essa foto vira o ícone do app (recortada em quadrado).'
              : 'Escolha uma foto da galeria pra ser o ícone do app, ou deixe o robozinho do Android.'}
          </Text>

          {!fotoIcone && (
            <>
              <Text style={[studioStyles.cfgLabel, { marginTop: 18 }]}>Cor do ícone</Text>
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
            </>
          )}
        </View>
      </ScrollView>

      {!tecladoVisivel && (
        <View style={[studioStyles.cfgFooter, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <TouchableOpacity style={[studioStyles.criarBtn, criandoProjeto && { opacity: 0.7 }]} onPress={criarProjeto} activeOpacity={0.85} disabled={criandoProjeto}>
            <Grad />
            {criandoProjeto
              ? <ActivityIndicator size="small" color="#ffffff" />
              : <MaterialCommunityIcons name="rocket-launch-outline" size={19} color="#ffffff" />}
            <Text style={studioStyles.criarBtnText}>Criar projeto</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // ---------- Tela 2: workspace (explorador + editor) ----------
  const renderWorkspace = () => (
    <>
      <View style={studioStyles.workspaceTopWrap}>

        <View style={studioStyles.topBar}>
          <TouchableOpacity style={studioStyles.topBarIconBtn} onPress={voltarParaHome} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.75}>
            <MaterialCommunityIcons name="arrow-left" size={18} color={COLORS.ink} />
          </TouchableOpacity>
          <TouchableOpacity style={studioStyles.topBarIconBtn} onPress={() => setSidebarAberta(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.75}>
            <MaterialCommunityIcons name="folder-outline" size={18} color={COLORS.ember} />
          </TouchableOpacity>
          <Text style={studioStyles.topBarTitle} numberOfLines={1}>{nomeApp || 'Meu App'}</Text>

          <View style={studioStyles.topBarActionsCard}>
            <TouchableOpacity
              style={[studioStyles.topBarIconBtn, !podeDesfazer && { opacity: 0.35 }]}
              onPress={desfazer}
              disabled={!podeDesfazer}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="undo" size={17} color={podeDesfazer ? COLORS.ink : COLORS.dim} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[studioStyles.topBarIconBtn, !podeRefazer && { opacity: 0.35 }]}
              onPress={refazer}
              disabled={!podeRefazer}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="redo" size={17} color={podeRefazer ? COLORS.ink : COLORS.dim} />
            </TouchableOpacity>
            <TouchableOpacity
              style={studioStyles.topBarIconBtn}
              onPress={async () => {
                const pasta = await salvarNoDisco();
                if (pasta) exibirAviso('Salvo', 'Projeto gravado no armazenamento do app.', 'sucesso');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="content-save-outline" size={17} color={COLORS.dim} />
            </TouchableOpacity>
            <TouchableOpacity
              style={studioStyles.topBarIconBtn}
              onPress={() => setPermissoesAberto(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="cog-outline" size={18} color={COLORS.dim} />
            </TouchableOpacity>
            <View style={studioStyles.topBarDivider} />
            <TouchableOpacity
              style={studioStyles.topBarIconBtn}
              onPress={() => setFolhaBuildAberta(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name={tipoBuild === 'release' ? 'shield-key' : 'shield-key-outline'} size={19} color={tipoBuild === 'release' ? '#8bd450' : COLORS.dim} />
            </TouchableOpacity>
            <TouchableOpacity
              style={studioStyles.topBarIconBtn}
              onPress={() => compilarProjeto(tipoBuild)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.75}
            >
              {compilando
                ? <ActivityIndicator size="small" color="#8bd450" />
                : <MaterialCommunityIcons name="play-circle" size={22} color="#8bd450" />}
            </TouchableOpacity>
          </View>
        </View>

        {abasAbertas.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={studioStyles.tabsBar}
            contentContainerStyle={studioStyles.tabsBarConteudo}
          >
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
                  <TouchableOpacity onPress={() => fecharAba(caminho)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 7 }}>
                    <MaterialCommunityIcons name="close" size={12} color={COLORS.dim} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {arquivoAtivo ? (
        <View
          ref={caixaEditorRef}
          style={{ flex: 1, paddingBottom: alturaTeclado }}
          onLayout={() => recalcularTecladoRef.current()}
        >
          <View style={studioStyles.pathBar}>
            <MaterialCommunityIcons name="folder-outline" size={12} color={COLORS.dim} />
            <Text style={studioStyles.pathBarText} numberOfLines={1} ellipsizeMode="head" maxFontSizeMultiplier={1.1}>{arquivoAtivo.split('/').join(' \u203a ')}</Text>
            <TouchableOpacity style={[studioStyles.pathBtn, barraEditor === 'buscar' && studioStyles.pathBtnAtivo]} onPress={abrirBarraBusca} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }} activeOpacity={0.7}>
              <MaterialCommunityIcons name="magnify" size={17} color={barraEditor === 'buscar' ? COLORS.ember : COLORS.dim} />
            </TouchableOpacity>
            <TouchableOpacity style={[studioStyles.pathBtn, barraEditor === 'linha' && studioStyles.pathBtnAtivo]} onPress={abrirBarraLinha} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }} activeOpacity={0.7}>
              <MaterialCommunityIcons name="format-list-numbered" size={17} color={barraEditor === 'linha' ? COLORS.ember : COLORS.dim} />
            </TouchableOpacity>
          </View>

          {barraEditor === 'buscar' && (
            <View style={studioStyles.edBarra}>
              <View style={studioStyles.edLinha}>
                <TextInput
                  style={studioStyles.edInput}
                  value={consultaEditor}
                  onChangeText={aoMudarConsulta}
                  placeholder={buscaEscopo === 'projeto' ? 'Buscar no projeto' : 'Buscar neste arquivo'}
                  placeholderTextColor={COLORS.dim}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  blurOnSubmit={false}
                  onSubmitEditing={() => proximaOcorrencia(1)}
                  selectionColor={COLORS.ember}
                  cursorColor={COLORS.ember}
                />
                <Text style={studioStyles.edContador} numberOfLines={1}>
                  {buscaEscopo === 'projeto'
                    ? (resultadosProjeto ? `${resultadosProjeto.total}` : '')
                    : (matchesArquivo.length ? `${idxBusca + 1}/${matchesArquivo.length}` : (consultaEditor ? '0' : ''))}
                </Text>
                {buscaEscopo === 'arquivo' && (
                  <>
                    <TouchableOpacity style={[studioStyles.edIconBtn, !matchesArquivo.length && { opacity: 0.35 }]} disabled={!matchesArquivo.length} onPress={() => proximaOcorrencia(-1)} activeOpacity={0.7}>
                      <MaterialCommunityIcons name="chevron-up" size={20} color={COLORS.ink} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[studioStyles.edIconBtn, !matchesArquivo.length && { opacity: 0.35 }]} disabled={!matchesArquivo.length} onPress={() => proximaOcorrencia(1)} activeOpacity={0.7}>
                      <MaterialCommunityIcons name="chevron-down" size={20} color={COLORS.ink} />
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity style={studioStyles.edIconBtn} onPress={fecharBarraEditor} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="close" size={18} color={COLORS.dim} />
                </TouchableOpacity>
              </View>

              <View style={studioStyles.edLinha}>
                <TouchableOpacity style={[studioStyles.edChip, buscaMaiusc && studioStyles.edChipAtivo]} onPress={alternarMaiusc} activeOpacity={0.7}>
                  <Text style={[studioStyles.edChipTexto, buscaMaiusc && studioStyles.edChipTextoAtivo]}>Aa</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[studioStyles.edChip, buscaEscopo === 'arquivo' && studioStyles.edChipAtivo]} onPress={() => { setBuscaEscopo('arquivo'); setConfirmarSubst(false); }} activeOpacity={0.7}>
                  <Text style={[studioStyles.edChipTexto, buscaEscopo === 'arquivo' && studioStyles.edChipTextoAtivo]}>Arquivo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[studioStyles.edChip, buscaEscopo === 'projeto' && studioStyles.edChipAtivo]} onPress={() => { setBuscaEscopo('projeto'); setConfirmarSubst(false); }} activeOpacity={0.7}>
                  <Text style={[studioStyles.edChipTexto, buscaEscopo === 'projeto' && studioStyles.edChipTextoAtivo]}>Projeto</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={[studioStyles.edChip, mostrarSubstituir && studioStyles.edChipAtivo]} onPress={() => { setMostrarSubstituir((v) => !v); setConfirmarSubst(false); }} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="swap-horizontal" size={15} color={mostrarSubstituir ? COLORS.ink : COLORS.dim} />
                  <Text style={[studioStyles.edChipTexto, mostrarSubstituir && studioStyles.edChipTextoAtivo]}>Substituir</Text>
                </TouchableOpacity>
              </View>

              {mostrarSubstituir && (
                <View style={studioStyles.edLinha}>
                  <TextInput
                    style={studioStyles.edInput}
                    value={substituirTexto}
                    onChangeText={(t) => { setSubstituirTexto(t); setConfirmarSubst(false); }}
                    placeholder="Substituir por"
                    placeholderTextColor={COLORS.dim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    selectionColor={COLORS.ember}
                    cursorColor={COLORS.ember}
                  />
                  {buscaEscopo === 'arquivo' ? (
                    <>
                      <TouchableOpacity style={[studioStyles.edBotaoAcao, !matchesArquivo.length && { opacity: 0.4 }]} disabled={!matchesArquivo.length} onPress={substituirAtual} activeOpacity={0.8}>
                        <Text style={studioStyles.edBotaoAcaoTexto}>Trocar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[studioStyles.edBotaoAcao, !matchesArquivo.length && { opacity: 0.4 }]} disabled={!matchesArquivo.length} onPress={substituirTodosArquivo} activeOpacity={0.8}>
                        <Text style={studioStyles.edBotaoAcaoTexto}>Todos</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={[studioStyles.edBotaoAcao, confirmarSubst && studioStyles.edBotaoPerigo, !(resultadosProjeto && resultadosProjeto.total) && { opacity: 0.4 }]}
                      disabled={!(resultadosProjeto && resultadosProjeto.total)}
                      onPress={substituirTodosProjeto}
                      activeOpacity={0.8}
                    >
                      <Text style={studioStyles.edBotaoAcaoTexto}>{confirmarSubst ? 'Confirmar' : 'Trocar tudo'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {buscaEscopo === 'projeto' && consultaEditor !== '' && resultadosProjeto && (
                <ScrollView style={studioStyles.edResultados} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  <Text style={studioStyles.edResResumo}>
                    {resultadosProjeto.total === 0
                      ? 'Nada encontrado no projeto.'
                      : `${resultadosProjeto.total} ${resultadosProjeto.total === 1 ? 'resultado' : 'resultados'} em ${resultadosProjeto.arquivos.length} ${resultadosProjeto.arquivos.length === 1 ? 'arquivo' : 'arquivos'}${resultadosProjeto.truncado ? ' (mostrando os primeiros)' : ''}${confirmarSubst ? ' — toque em Confirmar pra trocar tudo' : ''}`}
                  </Text>
                  {resultadosProjeto.arquivos.map((arq) => (
                    <View key={arq.caminho}>
                      <View style={studioStyles.edResArquivo}>
                        <MaterialCommunityIcons name="file-document-outline" size={13} color={COLORS.dim} />
                        <Text style={studioStyles.edResArquivoTexto} numberOfLines={1} ellipsizeMode="head">{arq.caminho}</Text>
                        <Text style={{ color: COLORS.dim, fontSize: 11.5 }}>{arq.total}</Text>
                      </View>
                      {arq.itens.map((it, i) => (
                        <TouchableOpacity key={`${arq.caminho}:${i}`} style={studioStyles.edResItem} onPress={() => irParaArquivoLinha(arq.caminho, it.linha, it.coluna)} activeOpacity={0.7}>
                          <Text style={studioStyles.edResLinha}>{it.linha}</Text>
                          <Text style={studioStyles.edResTrecho} numberOfLines={1}>{it.preview}</Text>
                        </TouchableOpacity>
                      ))}
                      {arq.total > arq.itens.length && (
                        <Text style={[studioStyles.edResResumo, { paddingTop: 0 }]}>+ {arq.total - arq.itens.length} neste arquivo</Text>
                      )}
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {barraEditor === 'linha' && (
            <View style={studioStyles.edBarra}>
              <View style={studioStyles.edLinha}>
                <MaterialCommunityIcons name="format-list-numbered" size={18} color={COLORS.ember} />
                <TextInput
                  style={studioStyles.edInput}
                  value={linhaDigitada}
                  onChangeText={(t) => setLinhaDigitada(t.replace(/\D/g, '').slice(0, 7))}
                  placeholder={`Ir para a linha (1 a ${numeroDeLinhas})`}
                  placeholderTextColor={COLORS.dim}
                  keyboardType="number-pad"
                  autoFocus
                  returnKeyType="go"
                  onSubmitEditing={executarIrLinha}
                  selectionColor={COLORS.ember}
                  cursorColor={COLORS.ember}
                />
                <TouchableOpacity style={[studioStyles.edBotaoAcao, !linhaDigitada && { opacity: 0.4 }]} disabled={!linhaDigitada} onPress={executarIrLinha} activeOpacity={0.8}>
                  <Text style={studioStyles.edBotaoAcaoTexto}>Ir</Text>
                </TouchableOpacity>
                <TouchableOpacity style={studioStyles.edIconBtn} onPress={fecharBarraEditor} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="close" size={18} color={COLORS.dim} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {errosArquivo.length > 0 && !marcasErroOcultas && (() => {
            const erro = errosArquivo[erroIdxSeguro];
            return (
              <View style={studioStyles.edErroBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color={COLORS.error} />
                <TouchableOpacity style={{ flex: 1 }} onPress={() => irParaErro(erroIdxSeguro)} activeOpacity={0.7}>
                  <Text style={studioStyles.edErroTexto} numberOfLines={2}>Linha {erro.linha} · {erro.mensagem}</Text>
                </TouchableOpacity>
                {errosArquivo.length > 1 && (
                  <>
                    <Text style={studioStyles.edContador}>{erroIdxSeguro + 1}/{errosArquivo.length}</Text>
                    <TouchableOpacity onPress={() => irParaErro(erroIdxSeguro - 1)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} activeOpacity={0.7}>
                      <MaterialCommunityIcons name="chevron-up" size={20} color={COLORS.ink} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => irParaErro(erroIdxSeguro + 1)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} activeOpacity={0.7}>
                      <MaterialCommunityIcons name="chevron-down" size={20} color={COLORS.ink} />
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity onPress={() => setMarcasErroOcultas(true)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} activeOpacity={0.7}>
                  <MaterialCommunityIcons name="close" size={16} color={COLORS.dim} />
                </TouchableOpacity>
              </View>
            );
          })()}
          <ItemAnimadoStudio key={arquivoAtivo} indice={0} style={{ flex: 1 }} leve>
            <View style={{ flex: 1 }} onTouchStart={aoTocarInicio} onTouchMove={aoTocarMover} onTouchEnd={aoTocarFim} onTouchCancel={aoTocarFim}>
            <ScrollView
              ref={scrollEditorRef}
              scrollEnabled={!pinchAtivo}
              style={{ flex: 1, backgroundColor: '#0a0a0c' }}
              contentContainerStyle={{ paddingBottom: tecladoVisivel ? 24 : Math.max(insets.bottom, 0) + 24 }}
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={16}
              onScroll={(e) => {
                const y = e.nativeEvent.contentOffset.y;
                scrollYEditorRef.current = y;
                atualizarJanelaEditor(y, alturaAreaEditorRef.current, alturaLinhaEditor);
              }}
              onLayout={(e) => {
                const altura = e.nativeEvent.layout.height;
                alturaAreaEditorRef.current = altura;
                atualizarJanelaEditor(scrollYEditorRef.current, altura, alturaLinhaEditor);
              }}
            >
              <View style={studioStyles.editorRow}>
                {/* Coluna de números: só desenha as linhas da "janela" atual — o
                    resto é só a altura certa em branco, então a barra de
                    rolagem continua do tamanho certo mesmo sem desenhar tudo. */}
                <View style={[studioStyles.lineNumbers, { width: larguraGutter, height: alturaTotalCodigo, paddingVertical: 0, paddingHorizontal: 0 }]}>
                  <NumerosJanelaStudio
                    store={janelaStoreRef.current}
                    total={numeroDeLinhas}
                    altura={alturaLinhaEditor}
                    larguraTexto={larguraGutter - 16}
                    zoom={zoomEditor}
                    errosSet={linhasComErro}
                    mostrarErros={!marcasErroOcultas}
                  />
                </View>
                <ScrollView
                  ref={scrollHorizRef}
                  horizontal
                  nestedScrollEnabled
                  scrollEnabled={!pinchAtivo}
                  style={{ flex: 1 }}
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  onLayout={(e) => setLarguraVisivelCodigo(Math.floor(e.nativeEvent.layout.width))}
                >
                  <View style={{ width: larguraCodigo, height: alturaTotalCodigo }}>
                    {/* Realces ATRÁS do texto (o TextInput é transparente):
                        linha pra onde acabou de pular, linhas com erro da
                        compilação e ocorrências da busca. */}
                    {destaqueLinha >= 0 && destaqueLinha < numeroDeLinhas && (
                      <Animated.View
                        pointerEvents="none"
                        style={{ position: 'absolute', left: 0, width: larguraCodigo, top: 14 + destaqueLinha * alturaLinhaEditor, height: alturaLinhaEditor, backgroundColor: 'rgba(255,122,217,0.16)', opacity: destaqueAnim }}
                      />
                    )}
                    {!marcasErroOcultas && errosArquivo.map((e, k) => {
                      const i = Number(e.linha) - 1;
                      if (i < 0 || i >= numeroDeLinhas) return null;
                      return (
                        <View
                          key={`er${k}`}
                          pointerEvents="none"
                          style={{ position: 'absolute', left: 0, width: larguraCodigo, top: 14 + i * alturaLinhaEditor, height: alturaLinhaEditor, backgroundColor: 'rgba(255,107,107,0.16)', borderBottomWidth: 1.5, borderBottomColor: 'rgba(255,107,107,0.85)' }}
                        />
                      );
                    })}
                    {barraEditor === 'buscar' && (
                      <MarcasBuscaJanelaStudio
                        store={janelaStoreRef.current}
                        total={numeroDeLinhas}
                        marcas={marcasBusca}
                        idxBusca={idxBusca}
                        altura={alturaLinhaEditor}
                        zoom={zoomEditor}
                      />
                    )}
                    <TextInput
                      style={[studioStyles.codeInput, { position: 'absolute', left: 0, top: trechoIni * alturaLinhaEditor, width: larguraCodigo, fontSize: CODIGO_FONTE * zoomEditor, lineHeight: alturaLinhaEditor }]}
                      value={textoTrecho}
                      onChangeText={alterarTrecho}
                      onSelectionChange={(e) => {
                        if (Date.now() < ignorarSelecaoAteRef.current) return;
                        const sel = e.nativeEvent.selection;
                        const off = trechoInfoRef.current.offset;
                        selecaoRef.current = { start: off + sel.start, end: off + sel.end };
                        agendarCaret(off + sel.end);
                      }}
                      onFocus={() => setEditorFocado(true)}
                      onBlur={() => setEditorFocado(false)}
                      selection={selecaoTrecho}
                      multiline
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      importantForAutofill="no"
                      keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
                      spellCheck={false}
                      scrollEnabled={false}
                      selectionColor={COLORS.ember}
                      cursorColor={COLORS.ember}
                      allowFontScaling={false}
                    />
                    {/* Camada de cor: vai DEPOIS do TextInput no JSX de
                        propósito, pra ser desenhada POR CIMA dele. É essa
                        ordem que resolve o "fantasma"/borrado: texto
                        transparente no Android ainda deixa um resquício
                        antialiasado visível, e se essa camada colorida
                        estiver por baixo (como estava antes) o resquício do
                        TextInput fica por cima escondendo a cor. Com a cor
                        por cima, ela cobre esse resquício por completo.
                        "pointerEvents: none" garante que toque/seleção
                        continuam indo 100% pro TextInput por baixo. */}
                    <View
                      pointerEvents="none"
                      style={[studioStyles.codeHighlightOverlay, { width: larguraCodigo, height: alturaTotalCodigo }]}
                    >
                      <LinhasCoresJanelaStudio
                        store={janelaStoreRef.current}
                        linhas={linhasAtivas}
                        altura={alturaLinhaEditor}
                        zoom={zoomEditor}
                        regex={regexLinguagemAtiva}
                      />
                    </View>
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
            {zoomVisivel && (
              <View pointerEvents="none" style={studioStyles.zoomBadge}>
                <Text style={studioStyles.zoomBadgeTexto}>{Math.round(zoomEditor * 100)}%</Text>
              </View>
            )}
            </View>
          </ItemAnimadoStudio>

        </View>
      ) : (
        <View style={studioStyles.emptyEditor}>
          <View style={studioStyles.emptyEditorIcone}>
            <MaterialCommunityIcons name="folder-open-outline" size={32} color={COLORS.ember} />
          </View>
          <Text style={studioStyles.emptyEditorTitulo}>Nenhum arquivo aberto</Text>
          <Text style={{ color: COLORS.dim, fontSize: 13, textAlign: 'center', lineHeight: 18 }}>
            Abra a pasta do projeto pra escolher um arquivo e começar a editar.
          </Text>
          <TouchableOpacity style={studioStyles.emptyEditorBtn} onPress={() => setSidebarAberta(true)} activeOpacity={0.85}>
            <MaterialCommunityIcons name="folder-outline" size={16} color="#ffffff" />
            <Text style={studioStyles.emptyEditorBtnText}>Ver arquivos</Text>
          </TouchableOpacity>
        </View>
      )}

      {sidebarAberta && (
        <PainelLateralStudio onFechar={() => setSidebarAberta(false)}>
          {(fechar) => (
            <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }}>
              <View style={studioStyles.sidebarHeader}>
                <View style={studioStyles.sidebarHeaderIcone}>
                  <MaterialCommunityIcons name="folder-outline" size={16} color={COLORS.ember} />
                </View>
                <Text style={studioStyles.sidebarTitle} numberOfLines={1} maxFontSizeMultiplier={1.15}>Arquivos do projeto</Text>
                <TouchableOpacity
                  style={studioStyles.sidebarHeaderBtn}
                  onPress={() => { fechar(); setMenuProjetoAberto(true); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.75}
                >
                  <MaterialCommunityIcons name="dots-vertical" size={18} color={COLORS.dim} />
                </TouchableOpacity>
                <TouchableOpacity style={studioStyles.sidebarHeaderBtn} onPress={fechar} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.75}>
                  <MaterialCommunityIcons name="close" size={18} color={COLORS.dim} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 10, paddingBottom: 24, paddingHorizontal: 10 }} showsVerticalScrollIndicator={false}>
                {projeto && projeto.arvore.map((no) => (
                  <NoArvoreArquivo
                    key={no.caminho}
                    no={no}
                    pastasAbertas={pastasAbertas}
                    alternarPasta={alternarPasta}
                    arquivoAtivo={arquivoAtivo}
                    onAbrirArquivo={(caminho) => { abrirArquivo(caminho); fechar(); }}
                    aoSegurar={abrirCardArquivo}
                  />
                ))}
              </ScrollView>
            </View>
          )}
        </PainelLateralStudio>
      )}

      {snippetsAberto && (
        <FolhaInferiorStudio onFechar={() => { setSnippetsAberto(false); setFiltroSnippet(''); }} insetBottom={Math.max(insets.bottom, 12) + alturaTeclado}>
          {(fechar) => {
            const termoSnip = filtroSnippet.trim().toLowerCase();
            const filtrados = termoSnip
              ? listaSnippets.filter((s) => s.g.includes(termoSnip) || s.nome.toLowerCase().includes(termoSnip) || s.desc.toLowerCase().includes(termoSnip))
              : listaSnippets;
            return (
              <>
                <Text style={studioStyles.folhaTitulo}>Snippets</Text>
                <Text style={[studioStyles.folhaSub, { marginBottom: 10 }]}>
                  {listaSnippets.length > 0
                    ? `${linguagemAtiva === 'xml' ? 'XML' : 'Java'} · toque pra inserir onde está o cursor`
                    : 'Disponíveis em arquivos .java e .xml'}
                </Text>
                {listaSnippets.length > 0 && (
                  <TextInput
                    style={[studioStyles.edInput, { flex: 0, marginBottom: 6 }]}
                    value={filtroSnippet}
                    onChangeText={setFiltroSnippet}
                    placeholder="Buscar snippet (toast, intent, onCreate...)"
                    placeholderTextColor={COLORS.dim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    selectionColor={COLORS.ember}
                    cursorColor={COLORS.ember}
                  />
                )}
                <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {listaSnippets.length === 0 ? (
                    <Text style={{ color: COLORS.dim, fontSize: 13, paddingVertical: 14 }}>Abra um arquivo .java ou .xml pra ver os snippets.</Text>
                  ) : filtrados.length === 0 ? (
                    <Text style={{ color: COLORS.dim, fontSize: 13, paddingVertical: 14 }}>Nenhum snippet com esse nome.</Text>
                  ) : filtrados.map((s) => (
                    <TouchableOpacity key={s.g} style={studioStyles.snipItem} onPress={() => { inserirSnippet(s); fechar(); }} activeOpacity={0.75}>
                      <View style={studioStyles.snipIcone}>
                        <MaterialCommunityIcons name="lightning-bolt-outline" size={17} color={COLORS.ember} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={studioStyles.snipNome} numberOfLines={1}>{s.nome}</Text>
                        <Text style={studioStyles.snipDesc} numberOfLines={1}>{s.desc}</Text>
                      </View>
                      <Text style={studioStyles.snipGatilho}>{s.g}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            );
          }}
        </FolhaInferiorStudio>
      )}

      {menuProjetoAberto && (
        <FolhaInferiorStudio onFechar={() => setMenuProjetoAberto(false)} insetBottom={insets.bottom}>
          {(fechar) => (
            <>
              <Text style={[studioStyles.folhaTitulo, { marginBottom: 14 }]}>Opções do projeto</Text>
              <TouchableOpacity
                style={[studioStyles.folhaLinha, confirmandoNovo && { backgroundColor: 'rgba(255,107,107,0.12)' }]}
                onPress={() => (confirmandoNovo ? novoProjeto() : setConfirmandoNovo(true))}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={confirmandoNovo ? 'alert-outline' : 'trash-can-outline'}
                  size={20}
                  color={confirmandoNovo ? '#ff8a80' : COLORS.dim}
                />
                <Text style={[studioStyles.folhaLinhaTexto, confirmandoNovo && { color: '#ff8a80' }]}>
                  {confirmandoNovo ? 'Toque de novo: apaga este projeto' : 'Excluir projeto'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </FolhaInferiorStudio>
      )}

      {permissoesAberto && (() => {
        const xml = projeto && projeto.conteudos ? projeto.conteudos[MANIFEST_PATH_STUDIO] : undefined;
        const ativas = xml !== undefined ? lerPermissoesManifest(xml) : new Set();
        const termo = buscaPermissao.trim().toLowerCase();
        const casa = (pm) => !termo || pm.nome.toLowerCase().includes(termo) || pm.desc.toLowerCase().includes(termo) || pm.id.toLowerCase().includes(termo);
        const conhecidas = new Set(PERMISSOES_STUDIO.map((pm) => pm.id));
        const outras = [...ativas].filter((n) => !conhecidas.has(n) && (!termo || n.toLowerCase().includes(termo)));
        const linhaPerm = (id, nome, desc, icone, perigosa) => {
          const ligada = ativas.has(id);
          return (
            <View key={id} style={studioStyles.permLinha}>
              <View style={studioStyles.nodoOpcaoIcone}>
                <MaterialCommunityIcons name={icone} size={20} color={ligada ? COLORS.ember : COLORS.dim} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={studioStyles.permNome} numberOfLines={1}>{nome}</Text>
                <Text style={studioStyles.nodoOpcaoDesc} numberOfLines={2}>
                  {desc}{perigosa ? ' · o app também precisa pedir autorização' : ''}
                </Text>
              </View>
              <Switch
                value={ligada}
                onValueChange={(v) => alternarPermissao(id, v)}
                trackColor={{ false: 'rgba(255,255,255,0.15)', true: COLORS.ember }}
                thumbColor="#ffffff"
              />
            </View>
          );
        };
        // Qualquer permissão que não está na lista: digite o nome na busca
        // (ex.: READ_LOGS ou com.empresa.permission.X) e ela aparece pra adicionar.
        const bruto = buscaPermissao.trim();
        let candidato = null;
        if (bruto && /^[A-Za-z][A-Za-z0-9_.]*$/.test(bruto)) {
          const idCand = bruto.includes('.') ? bruto : `android.permission.${bruto.toUpperCase()}`;
          if (!ativas.has(idCand) && !conhecidas.has(idCand)) candidato = idCand;
        }
        let algumaCoisa = false;
        return (
          <FolhaInferiorStudio
            onFechar={() => { setPermissoesAberto(false); setBuscaPermissao(''); }}
            insetBottom={alturaTeclado > 0 ? alturaTeclado + 12 : insets.bottom}
          >
            {() => (
              <>
                <View style={studioStyles.nodoTopo}>
                  <View style={studioStyles.nodoIcone}>
                    <MaterialCommunityIcons name="shield-check-outline" size={24} color={COLORS.ember} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={studioStyles.folhaTitulo}>Permissões do app</Text>
                    <Text style={studioStyles.folhaSub} numberOfLines={2}>
                      {xml === undefined
                        ? 'AndroidManifest.xml não encontrado'
                        : `${ativas.size} ${ativas.size === 1 ? 'ativa' : 'ativas'} · escreve sozinho no AndroidManifest.xml`}
                    </Text>
                  </View>
                </View>

                {xml !== undefined && (
                  <>
                    <View style={[studioStyles.cfgCampo, { marginTop: 14, marginBottom: 6 }]}>
                      <MaterialCommunityIcons name="magnify" size={18} color={COLORS.dim} />
                      <TextInput
                        style={studioStyles.cfgCampoInput}
                        value={buscaPermissao}
                        onChangeText={setBuscaPermissao}
                        placeholder="Buscar ou digitar o nome da permissão"
                        placeholderTextColor={COLORS.dim}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                    <ScrollView
                      style={{ maxHeight: Math.round(alturaTela * 0.48) }}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      {candidato && (() => {
                        algumaCoisa = true;
                        return (
                          <TouchableOpacity
                            style={studioStyles.nodoOpcao}
                            onPress={() => { alternarPermissao(candidato, true); setBuscaPermissao(''); }}
                            activeOpacity={0.8}
                          >
                            <View style={studioStyles.nodoOpcaoIcone}>
                              <MaterialCommunityIcons name="plus" size={20} color={COLORS.ember} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={studioStyles.permNome}>Adicionar esta permissão</Text>
                              <Text style={studioStyles.nodoOpcaoDesc} numberOfLines={2}>{candidato}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })()}
                      {GRUPOS_PERMISSOES_STUDIO.map((grupo) => {
                        const itens = PERMISSOES_STUDIO.filter((pm) => pm.grupo === grupo && casa(pm));
                        if (!itens.length) return null;
                        algumaCoisa = true;
                        return (
                          <View key={grupo}>
                            <Text style={studioStyles.permGrupo}>{grupo}</Text>
                            {itens.map((pm) => linhaPerm(pm.id, pm.nome, pm.desc, pm.icone, pm.perigosa))}
                          </View>
                        );
                      })}
                      {outras.length > 0 && (() => {
                        algumaCoisa = true;
                        return (
                          <View>
                            <Text style={studioStyles.permGrupo}>Outras no manifest</Text>
                            {outras.map((n) => linhaPerm(n, n.split('.').pop(), n, 'shield-outline', false))}
                          </View>
                        );
                      })()}
                      {!algumaCoisa && (
                        <Text style={[studioStyles.nodoOpcaoDesc, { textAlign: 'center', paddingVertical: 24 }]}>Nenhuma permissão encontrada</Text>
                      )}
                    </ScrollView>
                  </>
                )}
              </>
            )}
          </FolhaInferiorStudio>
        );
      })()}

      {cardNo && (
        <FolhaInferiorStudio
          key={cardNo.caminho}
          onFechar={() => { setCardNo(null); setPastaEmCriacao(false); setNomeNovaPasta(''); setConfirmandoExclusao(null); }}
          insetBottom={alturaTeclado > 0 ? alturaTeclado + 12 : insets.bottom}
        >
          {(fechar) => {
            const ehPasta = cardNo.tipo === 'pasta';
            const bin = projeto && projeto.binarios ? projeto.binarios[cardNo.caminho] : null;
            const txt = projeto && projeto.conteudos ? projeto.conteudos[cardNo.caminho] : undefined;
            const info = ehPasta ? { icon: 'folder-outline', color: COLORS.ember } : iconeArquivoStudio(cardNo.nome);
            const tipoNo = ehPasta ? null : descreverArquivoStudio(cardNo.nome, !bin);
            const qtdFilhos = (cardNo.filhos || []).length;
            let detalhe = '';
            if (ehPasta) detalhe = qtdFilhos === 0 ? 'Pasta vazia' : `Pasta · ${qtdFilhos} ${qtdFilhos === 1 ? 'item' : 'itens'}`;
            else if (bin) detalhe = `${tipoNo.texto} · ${formatarTamanhoStudio(bin.tamanho)}`;
            else if (txt !== undefined) {
              let linhas = 1;
              for (let i = 0; i < txt.length; i++) if (txt.charCodeAt(i) === 10) linhas++;
              detalhe = `${tipoNo.texto} · ${linhas} ${linhas === 1 ? 'linha' : 'linhas'}`;
            } else detalhe = tipoNo.texto;

            const nomeLimpo = nomeNovaPasta.trim().replace(/[^A-Za-z0-9._-]/g, '_');
            const sugestoes = ehPasta && pastaEmCriacao ? sugestoesPastaStudio(cardNo.caminho, cardNo.filhos) : [];

            return (
              <>
                <View style={studioStyles.nodoTopo}>
                  <View style={studioStyles.nodoIcone}>
                    <MaterialCommunityIcons name={info.icon} size={24} color={info.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={studioStyles.folhaTitulo} numberOfLines={1}>{cardNo.nome}</Text>
                    <Text style={studioStyles.folhaSub} numberOfLines={1}>{detalhe}</Text>
                  </View>
                </View>
                <Text style={studioStyles.nodoCaminho} numberOfLines={1} ellipsizeMode="head">{cardNo.caminho}</Text>

                {ehPasta && !pastaEmCriacao && (
                  <>
                    <TouchableOpacity style={studioStyles.nodoOpcao} onPress={() => adicionarArquivo(cardNo.caminho)} activeOpacity={0.8}>
                      <View style={studioStyles.nodoOpcaoIcone}>
                        <MaterialCommunityIcons name="file-plus-outline" size={20} color={COLORS.ember} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={studioStyles.folhaLinhaTexto}>Adicionar arquivo</Text>
                        <Text style={studioStyles.nodoOpcaoDesc}>Escolha no celular — o Studio detecta o tipo (código, imagem, som...)</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.dim} />
                    </TouchableOpacity>
                    <TouchableOpacity style={studioStyles.nodoOpcao} onPress={() => setPastaEmCriacao(true)} activeOpacity={0.8}>
                      <View style={studioStyles.nodoOpcaoIcone}>
                        <MaterialCommunityIcons name="folder-plus-outline" size={20} color={COLORS.ember} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={studioStyles.folhaLinhaTexto}>Criar pasta</Text>
                        <Text style={studioStyles.nodoOpcaoDesc}>Uma pasta nova dentro de {cardNo.nome}</Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.dim} />
                    </TouchableOpacity>
                  </>
                )}

                {ehPasta && pastaEmCriacao && (
                  <>
                    <View style={studioStyles.cfgCampo}>
                      <MaterialCommunityIcons name="folder-outline" size={18} color={COLORS.ember} />
                      <TextInput
                        style={studioStyles.cfgCampoInput}
                        value={nomeNovaPasta}
                        onChangeText={setNomeNovaPasta}
                        placeholder="Nome da pasta"
                        placeholderTextColor={COLORS.dim}
                        autoFocus
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="done"
                        onSubmitEditing={() => criarPasta(cardNo.caminho, nomeNovaPasta)}
                      />
                    </View>
                    {nomeLimpo !== '' && nomeLimpo !== nomeNovaPasta.trim() && (
                      <Text style={studioStyles.nodoDica}>Vai ficar como: {nomeLimpo} (sem espaço nem acento)</Text>
                    )}
                    {sugestoes.length > 0 && (
                      <View style={studioStyles.nodoChips}>
                        {sugestoes.map((sug) => (
                          <TouchableOpacity key={sug} style={studioStyles.nodoChip} onPress={() => setNomeNovaPasta(sug)} activeOpacity={0.8}>
                            <Text style={studioStyles.nodoChipTexto}>{sug}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                    <View style={studioStyles.folhaConfirmaBotoes}>
                      <TouchableOpacity
                        style={[studioStyles.folhaBtn, studioStyles.nodoBtnSec]}
                        onPress={() => { setPastaEmCriacao(false); setNomeNovaPasta(''); }}
                        activeOpacity={0.8}
                      >
                        <Text style={studioStyles.nodoBtnSecTexto}>Voltar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[studioStyles.folhaBtn, studioStyles.nodoBtnPrim, !nomeLimpo && { opacity: 0.4 }]}
                        onPress={() => criarPasta(cardNo.caminho, nomeNovaPasta)}
                        disabled={!nomeLimpo}
                        activeOpacity={0.85}
                      >
                        <MaterialCommunityIcons name="check" size={18} color="#ffffff" />
                        <Text style={studioStyles.nodoBtnPrimTexto}>Criar pasta</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {!ehPasta && (
                  <>
                    {!bin && (
                      <TouchableOpacity
                        style={studioStyles.nodoOpcao}
                        onPress={() => { const c = cardNo.caminho; setCardNo(null); abrirArquivo(c); }}
                        activeOpacity={0.8}
                      >
                        <View style={studioStyles.nodoOpcaoIcone}>
                          <MaterialCommunityIcons name="file-edit-outline" size={20} color={COLORS.ember} />
                        </View>
                        <Text style={studioStyles.folhaLinhaTexto}>Abrir no editor</Text>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.dim} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[studioStyles.nodoOpcao, confirmandoExclusao === cardNo.caminho && { backgroundColor: 'rgba(255,107,107,0.12)' }]}
                      onPress={() => (confirmandoExclusao === cardNo.caminho
                        ? excluirArquivo(cardNo.caminho)
                        : setConfirmandoExclusao(cardNo.caminho))}
                      activeOpacity={0.8}
                    >
                      <View style={studioStyles.nodoOpcaoIcone}>
                        <MaterialCommunityIcons
                          name={confirmandoExclusao === cardNo.caminho ? 'alert-outline' : 'trash-can-outline'}
                          size={20}
                          color="#ff8a80"
                        />
                      </View>
                      <Text style={[studioStyles.folhaLinhaTexto, { color: '#ff8a80' }]}>
                        {confirmandoExclusao === cardNo.caminho ? 'Toque de novo: apaga este arquivo' : 'Excluir arquivo'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            );
          }}
        </FolhaInferiorStudio>
      )}

      {folhaBuildAberta && (
        <FolhaInferiorStudio onFechar={() => setFolhaBuildAberta(false)} insetBottom={alturaTeclado > 0 ? alturaTeclado + 12 : insets.bottom}>
          {(fechar) => (
            <>
              <Text style={[studioStyles.folhaTitulo, { marginBottom: 14 }]}>Tipo de build</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                {[
                  { id: 'debug', rotulo: 'Debug', icone: 'bug-outline' },
                  { id: 'release', rotulo: 'Release', icone: 'rocket-launch-outline' },
                ].map((op) => {
                  const ativo = tipoBuild === op.id;
                  return (
                    <TouchableOpacity
                      key={op.id}
                      style={[studioStyles.folhaLinha, { flex: 1, marginBottom: 0, justifyContent: 'center' }, ativo && { backgroundColor: 'rgba(139,212,80,0.16)' }]}
                      onPress={() => { setTipoBuild(op.id); salvarPref('tipoBuild', op.id); }}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name={op.icone} size={19} color={ativo ? '#8bd450' : COLORS.dim} />
                      <Text style={[studioStyles.folhaLinhaTexto, { flex: 0 }, ativo && { color: '#8bd450' }]}>{op.rotulo}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {tipoBuild === 'debug' ? (
                <Text style={[studioStyles.cfgHint, { marginTop: 12 }]}>
                  Assina com a chave interna do Cindra. Serve pra testar neste aparelho.
                </Text>
              ) : (
                <>
                  <Text style={[studioStyles.cfgLabel, { marginTop: 16 }]}>Keystore</Text>
                  <TouchableOpacity style={[studioStyles.folhaLinha, { marginBottom: 0 }]} onPress={escolherKeystore} activeOpacity={0.8}>
                    <MaterialCommunityIcons name="key-chain-variant" size={20} color={keystoreInfo ? '#8bd450' : COLORS.dim} />
                    <Text style={studioStyles.folhaLinhaTexto} numberOfLines={1}>
                      {keystoreInfo ? keystoreInfo.nome : 'Escolher arquivo (.keystore, .p12)'}
                    </Text>
                    <MaterialCommunityIcons name="folder-open-outline" size={18} color={COLORS.dim} />
                  </TouchableOpacity>

                  <Text style={studioStyles.cfgLabel}>Alias</Text>
                  <TextInput
                    style={studioStyles.cfgInput}
                    value={aliasKeystore}
                    onChangeText={(t) => { setAliasKeystore(t); salvarPref('aliasKeystore', t); }}
                    placeholder="ex: key0 (vazio se só tem um)"
                    placeholderTextColor={COLORS.dim}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={studioStyles.cfgLabel}>Senha do keystore</Text>
                  <TextInput
                    style={studioStyles.cfgInput}
                    value={senhaKeystore}
                    onChangeText={setSenhaKeystore}
                    placeholder="obrigatória"
                    placeholderTextColor={COLORS.dim}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={studioStyles.cfgLabel}>Senha da chave</Text>
                  <TextInput
                    style={studioStyles.cfgInput}
                    value={senhaChave}
                    onChangeText={setSenhaChave}
                    placeholder="vazio = mesma do keystore"
                    placeholderTextColor={COLORS.dim}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={studioStyles.cfgHint}>
                    As senhas não ficam salvas: digite de novo quando reabrir o Cindra. O app assinado com release não instala por cima de um debug (desinstale o outro antes).
                  </Text>
                </>
              )}

              <TouchableOpacity
                style={[studioStyles.instalarBtn, { marginHorizontal: 0, marginTop: 18 }]}
                onPress={() => { fechar(); setTimeout(() => compilarProjeto(tipoBuild), 260); }}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="play-circle-outline" size={18} color="#ffffff" />
                <Text style={studioStyles.instalarBtnText}>{tipoBuild === 'release' ? 'Compilar release' : 'Compilar debug'}</Text>
              </TouchableOpacity>
            </>
          )}
        </FolhaInferiorStudio>
      )}

      <Modal
        visible={popupCodigo}
        transparent
        animationType="fade"
        onRequestClose={() => { Keyboard.dismiss(); setPopupCodigo(false); }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-start', paddingTop: 110, paddingHorizontal: 22 }}>
          <View style={{ backgroundColor: COLORS.panel2, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.line }}>
            <View style={{ alignItems: 'center', marginBottom: 10 }}>
              <MaterialCommunityIcons name="key-variant" size={30} color={COLORS.ember} />
            </View>
            <Text style={{ color: COLORS.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>Código secreto</Text>
            <Text style={{ color: COLORS.dim, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
              Use o código secreto para remover a marca d'água do app. Você só precisa digitar uma vez neste aparelho.
            </Text>
            <TextInput
              value={codigoDigitado}
              onChangeText={(t) => { setCodigoDigitado(t); if (erroCodigo) setErroCodigo(''); }}
              placeholder="Cole ou digite o código"
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              onSubmitEditing={aplicarCodigoSecreto}
              style={{
                marginTop: 14,
                color: COLORS.ink,
                backgroundColor: 'rgba(255,255,255,0.06)',
                borderRadius: 12,
                borderWidth: 1,
                borderColor: erroCodigo ? COLORS.error : COLORS.line,
                paddingHorizontal: 14,
                paddingVertical: 11,
                fontSize: 14,
              }}
            />
            {!!erroCodigo && (
              <Text style={{ color: COLORS.error, fontSize: 12.5, marginTop: 8 }}>{erroCodigo}</Text>
            )}
            <TouchableOpacity
              onPress={aplicarCodigoSecreto}
              activeOpacity={0.85}
              style={{ marginTop: 16, backgroundColor: COLORS.ember, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }}
            >
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14.5 }}>Remover marca d'água e compilar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={compilarComMarca}
              activeOpacity={0.7}
              style={{ marginTop: 8, paddingVertical: 11, alignItems: 'center' }}
            >
              <Text style={{ color: COLORS.dim, fontWeight: '600', fontSize: 13.5 }}>Compilar com marca d'água</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {painelCompilacao && (() => {
        const temErro = errosCompilacao.length > 0;
        const corEstado = temErro ? COLORS.error : apkGerado ? '#8bd450' : COLORS.ember;
        const iconeEstado = temErro ? 'alert-circle-outline' : apkGerado ? 'check-circle-outline' : 'cog-outline';
        const tituloEstado = temErro ? 'Erros na compilação' : apkGerado ? 'APK pronto' : compilando ? 'Compilando...' : 'Compilação';
        const subtituloEstado = temErro
          ? `${errosCompilacao.length} ${errosCompilacao.length === 1 ? 'problema encontrado' : 'problemas encontrados'} — toque para abrir o arquivo`
          : apkGerado
            ? 'Assinado e pronto para instalar neste aparelho'
            : compilando
              ? `Etapa ${Math.max(etapaCompilacaoAtual, 1)} de ${STEPS_COMPILACAO.length}`
              : 'Aguardando início';
        return (
          <View style={[StyleSheet.absoluteFill, studioStyles.overlayRaiz]}>
            <Pressable style={studioStyles.sidebarBackdrop} onPress={() => !compilando && setPainelCompilacao(false)} />
            <View style={[studioStyles.compilePanel, { paddingBottom: Math.max(insets.bottom, 12) }]}>

              {/* Cabeçalho: ícone de estado com brilho + título/subtítulo */}
              <View style={studioStyles.compileHeaderWrap}>
                <TouchableOpacity
                  style={studioStyles.compileCloseBtn}
                  onPress={() => !compilando && setPainelCompilacao(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={compilando ? 1 : 0.75}
                >
                  <MaterialCommunityIcons name="close" size={16} color={compilando ? 'rgba(255,255,255,0.25)' : COLORS.dim} />
                </TouchableOpacity>
                <Animated.View
                  style={[
                    studioStyles.compileIconCircle,
                    { borderColor: corEstado, backgroundColor: hexParaRgba(corEstado, 0.14), transform: [{ scale: pulsoCompilacao }] },
                  ]}
                >
                  {compilando ? (
                    <ActivityIndicator size="small" color={corEstado} />
                  ) : (
                    <MaterialCommunityIcons name={iconeEstado} size={26} color={corEstado} />
                  )}
                </Animated.View>
                <Text style={studioStyles.compileTitulo}>{tituloEstado}</Text>
                <Text style={studioStyles.compileSubtitulo} numberOfLines={2}>{subtituloEstado}</Text>
              </View>

              {/* Barra de progresso das 6 etapas do build */}
              <View style={studioStyles.progressTrackWrap}>
                <View style={studioStyles.progressTrack}>
                  <Animated.View
                    style={[
                      studioStyles.progressFill,
                      {
                        backgroundColor: temErro ? COLORS.error : corEstado,
                        width: progressoCompilacao.interpolate({
                          inputRange: [0, STEPS_COMPILACAO.length],
                          outputRange: ['0%', '100%'],
                          extrapolate: 'clamp',
                        }),
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Stepper com as 6 etapas nomeadas */}
              <View style={studioStyles.stepperWrap}>
                {STEPS_COMPILACAO.map((step, i) => {
                  const numero = i + 1;
                  const feita = numero < etapaCompilacaoAtual || (numero === etapaCompilacaoAtual && (apkGerado || (!compilando && !temErro)));
                  const comErroAqui = temErro && numero === etapaCompilacaoAtual;
                  const ativa = compilando && numero === etapaCompilacaoAtual;
                  return (
                    <View key={step.titulo} style={studioStyles.stepperItem}>
                      {i > 0 && (
                        <View
                          style={[
                            studioStyles.stepLinha,
                            { width: '200%', left: '-100%' },
                            numero <= etapaCompilacaoAtual && !comErroAqui && studioStyles.stepLinhaFeita,
                          ]}
                          pointerEvents="none"
                        />
                      )}
                      <View
                        style={[
                          studioStyles.stepDot,
                          feita && !comErroAqui && studioStyles.stepDotFeita,
                          ativa && studioStyles.stepDotAtiva,
                          comErroAqui && studioStyles.stepDotErro,
                        ]}
                      >
                        {comErroAqui ? (
                          <MaterialCommunityIcons name="close" size={14} color={COLORS.error} />
                        ) : feita ? (
                          <MaterialCommunityIcons name="check" size={14} color="#0d0d10" />
                        ) : (
                          <MaterialCommunityIcons name={step.icone} size={14} color={ativa ? COLORS.ember : COLORS.dim} />
                        )}
                      </View>
                      <Text style={[studioStyles.stepLabel, (ativa || feita) && studioStyles.stepLabelAtiva]} numberOfLines={1}>
                        {step.titulo}
                      </Text>
                    </View>
                  );
                })}
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 10 }}>
                {apkGerado && !compilando && (
                  <View style={studioStyles.successCard}>
                    <MaterialCommunityIcons name="android" size={30} color="#8bd450" />
                    <View style={studioStyles.successCardTextos}>
                      <Text style={studioStyles.successCardTitulo}>{projeto ? projeto.pacote : 'app'}.apk</Text>
                      <Text style={studioStyles.successCardCaminho} numberOfLines={1}>{apkGerado}</Text>
                    </View>
                  </View>
                )}

                {temErro && errosCompilacao.map((erro, i) => (
                  <TouchableOpacity key={`e${i}`} style={[studioStyles.erroCard, { marginHorizontal: 14 }]} activeOpacity={0.75} onPress={() => abrirErro(erro)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <MaterialCommunityIcons name="file-alert-outline" size={13} color="#ff8a80" />
                      <Text style={studioStyles.erroArquivo} numberOfLines={2}>
                        {erro.arquivo}{erro.linha ? `  ·  linha ${erro.linha}` : ''}
                      </Text>
                    </View>
                    <Text style={studioStyles.erroMensagem}>{erro.mensagem}</Text>
                  </TouchableOpacity>
                ))}

                {(logAmigavel.length > 0 || apkGerado) && (
                  <View style={studioStyles.logCard}>
                    <View style={studioStyles.logCardHeader}>
                      <MaterialCommunityIcons name="timeline-check-outline" size={13} color={COLORS.dim} />
                      <Text style={studioStyles.logCardHeaderText}>Progresso</Text>
                    </View>
                    {logAmigavel.map((item, i) => {
                      const ehUltimo = i === logAmigavel.length - 1 && !apkGerado;
                      const emAndamento = compilando && ehUltimo && item.tipo !== 'erro';
                      const erro = item.tipo === 'erro';
                      const cor = erro ? COLORS.error : emAndamento ? COLORS.ember : '#8bd450';
                      return (
                        <View key={`l${i}`} style={studioStyles.logItem}>
                          <View style={[studioStyles.logItemIcone, { borderColor: hexParaRgba(cor, 0.5), backgroundColor: hexParaRgba(cor, 0.14) }]}>
                            {emAndamento ? (
                              <ActivityIndicator size={10} color={cor} />
                            ) : (
                              <MaterialCommunityIcons name={erro ? 'close' : 'check'} size={11} color={cor} />
                            )}
                          </View>
                          <Text style={[studioStyles.logItemTexto, emAndamento && { color: COLORS.ink }, erro && { color: '#ff8a80' }]}>{item.texto}</Text>
                        </View>
                      );
                    })}
                    {apkGerado && !compilando && (
                      <View style={studioStyles.logItem}>
                        <View style={[studioStyles.logItemIcone, { borderColor: hexParaRgba('#8bd450', 0.5), backgroundColor: hexParaRgba('#8bd450', 0.14) }]}>
                          <MaterialCommunityIcons name="check-all" size={11} color="#8bd450" />
                        </View>
                        <Text style={[studioStyles.logItemTexto, { color: COLORS.ink, fontWeight: '700' }]}>App pronto para instalar</Text>
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>

              {apkGerado && !compilando && (
                <TouchableOpacity style={[studioStyles.instalarBtn, { shadowColor: '#8bd450', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }]} onPress={instalarApk} activeOpacity={0.85}>
                  <MaterialCommunityIcons name="cellphone-arrow-down" size={18} color="#ffffff" />
                  <Text style={studioStyles.instalarBtnText}>Instalar APK</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })()}
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000000', paddingTop: insets.top }}>
      {etapa !== 'workspace' && <FundoVivo />}
      <EntradaAleatoria key={etapa} style={{ flex: 1 }}>
        {etapa === 'home' ? renderHome() : etapa === 'config' ? renderConfig() : renderWorkspace()}
      </EntradaAleatoria>
      {etapa === 'home' && <BotaoWhatsFlutuante bottom={Math.max(insets.bottom, 12) + 84} />}
      <EditorImagem
        visible={!!editorFotoUri}
        uri={editorFotoUri}
        titulo="Foto do ícone"
        proporcaoInicial="1:1"
        tamanhoInicial={512}
        onCancelar={() => setEditorFotoUri(null)}
        onConfirmar={({ uri }) => { setFotoIcone(uri); setEditorFotoUri(null); }}
      />
      <AtualizacaoForcada />
      <BloqueioVersao />
      <AvisosDoServidor />
    </View>
  );
}

// Se qualquer tela quebrar ao desenhar, em vez do erro real aparece o aviso de
// manutenção (com botão pra tentar de novo).
class ErroSeguroStudio extends React.Component {
  constructor(props) {
    super(props);
    this.state = { quebrou: false };
  }
  static getDerivedStateFromError() {
    return { quebrou: true };
  }
  componentDidCatch() {
    // o erro real fica só no log interno, nunca na tela
  }
  render() {
    if (!this.state.quebrou) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <MaterialCommunityIcons name="wrench-outline" size={52} color={COLORS.ember} />
        <Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 18 }}>{TITULO_MANUTENCAO}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 }}>{MSG_MANUTENCAO}</Text>
        <Pressable
          onPress={() => this.setState({ quebrou: false })}
          style={{ marginTop: 24, paddingHorizontal: 26, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#ffffff', fontSize: 14.5, fontWeight: '700' }}>Tentar de novo</Text>
        </Pressable>
      </View>
    );
  }
}

function CindraStudioSeguro(props) {
  return (
    <ErroSeguroStudio>
      <CindraStudioScreen {...props} />
    </ErroSeguroStudio>
  );
}

export { NoticeCardHost };
export default CindraStudioSeguro;
