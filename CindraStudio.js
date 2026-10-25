import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
  Switch,
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

const CODIGO_FONTE = 13; // fonte do editor (também usada pra calcular a largura do código)

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
  // Cores do destaque de sintaxe do editor (Studio) — paleta própria pra
  // não colidir com os selos/badges que já usam ember/roxo/azul acima.
  syntaxKeyword: '#ff9d6b',
  syntaxString: '#ffd479',
  syntaxComment: 'rgba(255,255,255,0.32)',
  syntaxNumber: '#8fd6ff',
  syntaxTag: '#8fd6ff',
  syntaxAttr: '#c9a7ff',
};

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

// Converte o log cru em itens bonitos: { tipo: 'etapa'|'info'|'erro', texto, numero }.
function montarLogAmigavel(logCru) {
  const itens = [];
  let ultimoDownload = -1;
  logCru.forEach((linha) => {
    const bruta = String(linha || '').trim();
    if (!bruta) return;
    const etapa = /^(\d+)\/6/.exec(bruta);
    if (etapa) {
      const n = parseInt(etapa[1], 10);
      if (n >= 1 && n <= 6) itens.push({ tipo: 'etapa', numero: n, texto: TEXTOS_ETAPAS_LOG[n - 1] });
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
      itens.push({ tipo: 'erro', texto: 'Algo deu errado na compilação' });
      return;
    }
    if (/^erro:/i.test(bruta)) {
      const msg = bruta.replace(/^erro:\s*/i, '');
      itens.push({ tipo: 'erro', texto: REGEX_LINHA_TECNICA.test(msg) ? 'Não foi possível compilar o app' : msg });
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
// Só o robozinho do Android: qualquer outro visual vem de uma foto da galeria.
const ICONES_APP_STUDIO = ['android'];
// Quando o app usa foto no lugar do ícone padrão, o PNG entra aqui (e o
// ic_launcher.xml deixa de existir — os dois com o mesmo nome dariam
// recurso duplicado no aapt2).
const ICONE_FOTO_CAMINHO = 'app/src/main/res/drawable/ic_launcher.png';
const PASTA_ICONES_STUDIO = `${FileSystem.documentDirectory}cindrastudio/_icones/`;
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
  instalarBtnText: { color: '#1a0806', fontSize: 14.5, fontWeight: '700' },
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
  stepDotAtiva: { borderColor: COLORS.ember, backgroundColor: 'rgba(255,82,39,0.14)' },
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
    backgroundColor: 'rgba(255,82,39,0.14)',
    borderColor: 'rgba(255,82,39,0.45)',
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
    backgroundColor: 'rgba(255,82,39,0.12)',
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
  emptyEditorBtnText: { color: '#1a0806', fontSize: 13.5, fontWeight: '700' },
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
    backgroundColor: 'rgba(255,82,39,0.14)',
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
  treeRowArquivoAtiva: { backgroundColor: 'rgba(255,82,39,0.15)', borderColor: 'rgba(255,82,39,0.42)' },
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
  cfgIconeFoto: { width: 116, height: 116, borderRadius: 30, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: '#1a0f0e' },
  cfgIconeBadge: { position: 'absolute', right: -6, bottom: -6, width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.ember, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#170c0b' },
  cfgCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 20, padding: 16, marginBottom: 14 },
  cfgCampo: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.28)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 14, paddingHorizontal: 14 },
  cfgCampoFoco: { borderColor: 'rgba(255,82,39,0.65)', backgroundColor: 'rgba(255,82,39,0.06)' },
  cfgCampoInput: { flex: 1, color: COLORS.ink, fontSize: 15, paddingVertical: 13 },
  cfgBtnRow: { flexDirection: 'row', gap: 10 },
  cfgBtnPrimario: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, backgroundColor: 'rgba(255,82,39,0.13)', borderWidth: 1, borderColor: 'rgba(255,82,39,0.4)' },
  cfgBtnPrimarioTexto: { color: '#ff8a68', fontSize: 14, fontWeight: '700' },
  cfgBtnSecundario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  cfgBtnSecundarioTexto: { color: COLORS.ink, fontSize: 13.5, fontWeight: '600' },
  cfgFooter: { paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', backgroundColor: COLORS.sheet },
  previewName: { color: COLORS.ink, fontSize: 18, fontWeight: '800' },
  previewPkg: { color: COLORS.dim, fontSize: 12.5, marginTop: 3 },
  criarBtn: {
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
  criarBtnText: { color: '#1a0806', fontSize: 15.5, fontWeight: '800' },
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
  heroCard: { backgroundColor: '#4a1a26', borderRadius: 28, padding: 18, marginTop: 14, overflow: 'hidden' },
  heroMarcaDagua: { position: 'absolute', right: -26, top: -22, opacity: 0.07 },
  heroTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heroSelo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,220,210,0.14)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroSeloTexto: { color: '#ffdcd2', fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  heroTempo: { color: 'rgba(255,220,210,0.7)', fontSize: 11 },
  heroCorpo: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  heroNome: { color: '#ffffff', fontSize: 17.5, fontWeight: '800' },
  heroPacote: { color: 'rgba(255,220,210,0.7)', fontSize: 11.5, marginTop: 2 },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#ffdcd2',
  },
  heroBtnText: { color: '#4a1a26', fontSize: 13, fontWeight: '800' },
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
  tileAtivo: { backgroundColor: 'rgba(255,82,39,0.16)', borderColor: 'rgba(255,82,39,0.45)' },
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
    backgroundColor: 'rgba(255,82,39,0.10)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  avisoTexto: { flex: 1, color: COLORS.ink, fontSize: 11.5, lineHeight: 16 },
  avisoBtnText: { color: '#ff8a68', fontSize: 11.5, fontWeight: '800' },
  // Card de apoio
  apoioCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,182,72,0.45)',
    borderRadius: 22,
    padding: 14,
    marginTop: 8,
  },
  apoioTag: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,182,72,0.14)',
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
    backgroundColor: 'rgba(255,182,72,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  apoioTitulo: { color: COLORS.ink, fontSize: 14, fontWeight: '700' },
  apoioSub: { color: COLORS.dim, fontSize: 11.5, marginTop: 2 },
  // Estado vazio
  vazioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: COLORS.ember,
  },
  vazioBtnText: { color: '#1a0806', fontSize: 13, fontWeight: '800' },
  // Barra de baixo
  navHome: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: '#211210',
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
  navAbaAtiva: { backgroundColor: 'rgba(255,82,39,0.20)', borderColor: 'rgba(255,82,39,0.45)' },
  navAbaTexto: { color: COLORS.dim, fontSize: 10.5, fontWeight: '600' },
  navAbaTextoAtivo: { color: COLORS.ink, fontWeight: '700' },
  navBotaoCriar: {
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
  navBotaoCriarTexto: { color: '#1a0806', fontSize: 12, fontWeight: '800' },
  // Folha que sobe do rodapé
  folha: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1e1110',
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
  cfgAbaTextoSel: { color: '#1a0806' },
  spLiga: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  spLigaIcone: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,82,39,0.12)' },
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
  spBtnPrimTexto: { color: '#1a0806', fontSize: 14.5, fontWeight: '800' },
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
  nodoBtnPrimTexto: { color: '#1a0806', fontSize: 15, fontWeight: '800' },
  folhaConfirma: { backgroundColor: 'rgba(255,107,107,0.10)', borderRadius: 16, padding: 14 },
  folhaConfirmaTexto: { color: '#ffb4a8', fontSize: 13.5, lineHeight: 19, marginBottom: 14 },
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
    backgroundColor: 'rgba(255,82,39,0.16)',
  },
  grupoBadgeTexto: { color: '#ff8a68', fontSize: 10.5, fontWeight: '800' },
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
    backgroundColor: 'rgba(255,82,39,0.12)',
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
  barraApagarTexto: { color: '#1a0806', fontSize: 12, fontWeight: '800' },
});

// Barra de baixo da tela inicial: abas "Meus apps", "Gerados" e "Aprender" + botão "Criar".
const ABAS_HOME_STUDIO = [
  { id: 'apps', rotulo: 'Meus apps', icone: 'view-dashboard-outline', iconeAtivo: 'view-dashboard' },
  { id: 'gerados', rotulo: 'Gerados', icone: 'package-variant-closed', iconeAtivo: 'package-variant' },
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

// Item que entra com fade + subida suave (o atraso cresce com a posição na lista).
function ItemAnimadoStudio({ indice = 0, style, children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 320,
      delay: Math.min(indice, 8) * 50,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);
  return (
    <Animated.View
      style={[style, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

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
                ? <ActivityIndicator size="small" color="#1a0806" />
                : <Text style={[studioStyles.folhaBtnTexto, { color: '#1a0806', fontWeight: '800' }]}>Salvar</Text>}
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
              <Text style={[studioStyles.folhaBtnTexto, { color: '#1a0806' }]}>Excluir</Text>
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
        style={{ width: lado, height: lado, borderRadius: raio, backgroundColor: '#1a0f0e' }}
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
      <MaterialCommunityIcons name={(dados && dados.iconeEscolhido) || ICONES_APP_STUDIO[0]} size={icone} color="#1a0806" />
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
import android.content.res.AssetFileDescriptor;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;

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
                    AssetFileDescriptor afd = getAssets().openFd("musica.mp3");
                    player = new MediaPlayer();
                    player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                    afd.close();
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
            InputStream entrada = getAssets().open("foto.png");
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
];

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
  chipAtivo: { backgroundColor: 'rgba(255,82,39,0.20)', borderColor: 'rgba(255,82,39,0.55)' },
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
    backgroundColor: 'rgba(255,182,72,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,182,72,0.25)',
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
  copiarTexto: { color: '#1a0806', fontSize: 11.5, fontWeight: '800' },
  codigoCaixa: {
    borderRadius: 12,
    backgroundColor: '#0d0707',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  codigoTexto: {
    color: '#e8dcd9',
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

function CindraStudioScreen({ visible, onClose }) {
  const insets = useSafeAreaInsets();

  const [etapa, setEtapa] = useState('home'); // 'home' | 'config' | 'workspace'
  const [nomeApp, setNomeApp] = useState('Meu App');
  const [nomePacote, setNomePacote] = useState('com.dev.meuapp');
  const [iconeEscolhido, setIconeEscolhido] = useState(ICONES_APP_STUDIO[0]);
  const [corIcone, setCorIcone] = useState(CORES_ICONE_STUDIO[0]);
  const [fotoIcone, setFotoIcone] = useState(null); // uri do PNG do ícone (foto da galeria), ou null = robozinho
  const [processandoFoto, setProcessandoFoto] = useState(false);
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
  const [abaHome, setAbaHome] = useState('apps'); // barra de baixo da tela inicial: 'apps' | 'gerados' | 'aprender'
  const [exemploAberto, setExemploAberto] = useState(null); // id do exemplo aberto na aba Aprender
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
  const [alturaTeclado, setAlturaTeclado] = useState(0); // teclado aberto → editor encolhe pra ficar acima dele
  const [caretPos, setCaretPos] = useState(0); // posição do cursor no texto (pra rolar até ele)
  const scrollEditorRef = useRef(null);
  const scrollYEditorRef = useRef(0);
  const alturaAreaEditorRef = useRef(0);
  const [larguraVisivelCodigo, setLarguraVisivelCodigo] = useState(0); // largura da área do código (sem a coluna de números)
  // "Janela" de linhas realmente desenhadas (números + destaque de sintaxe).
  // Em vez de criar um <Text> pra cada linha do arquivo inteiro (pesado em
  // arquivo grande), só desenha as linhas perto do que está visível na tela
  // — o resto vira espaço em branco do tamanho certo, então a rolagem não
  // "pula" nada.
  const [janelaEditor, setJanelaEditor] = useState({ inicio: 0, fim: 120 });
  const janelaEditorRef = useRef(janelaEditor);
  janelaEditorRef.current = janelaEditor;
  // Trecho (em linhas) que está de fato dentro do TextInput.
  const [trecho, setTrecho] = useState({ ini: 0, fim: 150 });
  const trechoInfoRef = useRef({ ini: 0, fim: 1, offset: 0, tamanho: 0, quebras: 0, total: 1 });
  const ignorarSelecaoAteRef = useRef(0); // ignora seleção "fantasma" logo após trocar o trecho
  const primeiraTrocaTrechoRef = useRef(true);
  const [menuProjetoAberto, setMenuProjetoAberto] = useState(false); // folha "Opções do projeto" (fora do menu lateral)

  // Compilação (▶)
  const [compilando, setCompilando] = useState(false);
  const [painelCompilacao, setPainelCompilacao] = useState(false);
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
    })().catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Foto do estado atual (só existe depois de carregar e com projeto criado).
  estadoRef.current = estadoCarregado && projeto
    ? { versao: 1, nomeApp, nomePacote, iconeEscolhido, corIcone, fotoIcone, projeto, pastasAbertas, abasAbertas, arquivoAtivo }
    : null;

  // Salva sozinho, meio segundo depois da última mudança (digitar, abrir
  // aba, criar projeto...).
  useEffect(() => {
    if (!estadoRef.current) return undefined;
    const t = setTimeout(() => {
      if (estadoRef.current) gravarEstadoStudio(estadoRef.current).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [estadoCarregado, projeto, pastasAbertas, abasAbertas, arquivoAtivo, nomeApp, nomePacote, iconeEscolhido, corIcone, fotoIcone]);

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
    if (!sidebarAberta) { setCardNo(null); }
  }, [sidebarAberta]);

  useEffect(() => {
    if (!menuProjetoAberto) { setConfirmandoNovo(false); }
  }, [menuProjetoAberto]);

  // Stepper do painel de compilação: acha a etapa mais avançada citada no
  // log ("N/6 ...") e anima a barra até lá. Quando o APK sai pronto, força
  // as 6 etapas preenchidas (o "6/6" às vezes nem aparece no log nativo).
  const etapaCompilacaoAtual = useMemo(() => {
    let max = 0;
    for (let i = logCompilacao.length - 1; i >= 0; i -= 1) {
      const m = /^(\d+)\/6/.exec(logCompilacao[i]);
      if (m) { max = parseInt(m[1], 10); break; }
    }
    if (apkGerado) return STEPS_COMPILACAO.length;
    return Math.min(max, STEPS_COMPILACAO.length);
  }, [logCompilacao, apkGerado]);

  const logAmigavel = useMemo(() => montarLogAmigavel(logCompilacao), [logCompilacao]);

  useEffect(() => {
    Animated.timing(progressoCompilacao, {
      toValue: etapaCompilacaoAtual,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // anima largura (%), não dá pra usar o driver nativo
    }).start();
  }, [etapaCompilacaoAtual]);

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
      exibirAviso('Não deu pra salvar', String(err && err.message ? err.message : err), 'erro');
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
      exibirAviso('Erro ao adicionar', String(e && e.message ? e.message : e), 'erro');
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

  // Galeria → recorte quadrado (editor do próprio seletor) → PNG 512×512.
  // Foto grande no ícone pesa no APK e trava o launcher, então reduz aqui.
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
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
      if (r.canceled || !r.assets || !r.assets.length) return;
      setProcessandoFoto(true);
      const uri = r.assets[0].uri;
      const base = await ImageManipulator.manipulateAsync(uri, [], {});
      const lado = Math.min(base.width, base.height);
      const acoes = [];
      if (base.width !== base.height) {
        acoes.push({ crop: { originX: Math.floor((base.width - lado) / 2), originY: Math.floor((base.height - lado) / 2), width: lado, height: lado } });
      }
      const alvo = Math.min(512, lado);
      acoes.push({ resize: { width: alvo, height: alvo } });
      const saida = await ImageManipulator.manipulateAsync(uri, acoes, { format: ImageManipulator.SaveFormat.PNG, compress: 1 });
      setFotoIcone(saida.uri);
    } catch (e) {
      exibirAviso('Não deu pra usar a foto', String(e && e.message ? e.message : e), 'erro');
    } finally {
      setProcessandoFoto(false);
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
  const OVERSCAN_LINHAS_EDITOR = 30;
  const atualizarJanelaEditor = useCallback((offsetY, alturaVisivel, alturaLinha) => {
    const linha = Math.max(0, Math.floor((offsetY || 0) / (alturaLinha || 20)));
    const linhasNaTela = Math.ceil((alturaVisivel || 700) / (alturaLinha || 20));
    const novoInicio = Math.max(0, linha - OVERSCAN_LINHAS_EDITOR);
    const novoFim = linha + linhasNaTela + OVERSCAN_LINHAS_EDITOR;
    const info = trechoInfoRef.current;
    const base = linha + linhasNaTela;
    if (
      (linha - info.ini < TRECHO_MARGEM_LINHAS && info.ini > 0) ||
      (info.fim - base < TRECHO_MARGEM_LINHAS && info.fim < info.total)
    ) {
      ignorarSelecaoAteRef.current = Date.now() + 250;
      setTrecho({ ini: Math.max(0, linha - TRECHO_FOLGA_LINHAS), fim: base + TRECHO_FOLGA_LINHAS });
    }
    const atual = janelaEditorRef.current;
    if (Math.abs(atual.inicio - novoInicio) < 15 && Math.abs(atual.fim - novoFim) < 15) return;
    setJanelaEditor({ inicio: novoInicio, fim: novoFim });
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

  const posicionarCursor = (pos) => {
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
  const salvarNoDisco = async () => {
    if (!projeto) return null;
    try {
      return await gravarProjetoStudio(projeto);
    } catch (e) {
      exibirAviso('Erro ao salvar', String(e && e.message ? e.message : e), 'erro');
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
      exibirAviso('Erro ao escolher o keystore', String(e && e.message ? e.message : e), 'erro');
    }
  };

  // modo: 'debug' (chave interna do Cindra) ou 'release' (keystore escolhido).
  const compilarProjeto = async (modo = 'debug') => {
    if (compilando) return;
    const release = modo === 'release';
    if (release) {
      if (!keystoreInfo) { exibirAviso('Falta o keystore', 'Escolha o arquivo .keystore / .p12 pra assinar o release.', 'aviso'); return; }
      if (!senhaKeystore) { exibirAviso('Falta a senha', 'Digite a senha do keystore.', 'aviso'); return; }
    }
    if (!ApkBuilder.disponivel) {
      exibirAviso('Precisa de rebuild', 'O módulo nativo apk-builder ainda não está neste app. Faça o eas build uma vez (veja o LEIAME do módulo).', 'aviso');
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
      add("Aplicando marca d'água do CindraStudio...");
      const pasta = await salvarNoDisco();
      if (!pasta) {
        add('Não foi possível gravar o projeto em disco.');
        return;
      }
      add("Marca d'água aplicada.");

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
    } catch (e) {
      // sem histórico desta vez, mas o APK existe.
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
      exibirAviso('Erro ao instalar', String(e && e.message ? e.message : e), 'erro');
    }
  };

  const apagarBuilds = async (ids) => {
    const alvo = builds.filter((b) => ids.includes(b.id));
    alvo.forEach((b) => {
      FileSystem.deleteAsync(b.apk, { idempotent: true }).catch(() => {});
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
  conteudoAtivoRef.current = conteudoAtivo;
  const hist = arquivoAtivo ? historicoRef.current[arquivoAtivo] : null;
  const podeDesfazer = !!(hist && hist.undo.length > 0);
  const podeRefazer = !!(hist && hist.redo.length > 0);
  const escalaFonte = PixelRatio.getFontScale();
  const alturaLinhaEditor = 20 * escalaFonte;

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
    const larguraCaractere = CODIGO_FONTE * 0.6 * escalaFonte;
    const largura = Math.max(larguraVisivelCodigo, Math.ceil((maior + 4) * larguraCaractere) + 24);
    return { linhasAtivas: linhas, numeroDeLinhas: linhas.length, larguraCodigo: largura };
  }, [conteudoAtivo, larguraVisivelCodigo, escalaFonte]);

  // Recorte de linhas que a janela do editor manda desenhar agora, já
  // limitado ao tamanho real do arquivo (o arquivo pode ter menos linhas
  // que a janela pedida, ex.: arquivo pequeno ou acabou de abrir).
  const janelaInicio = Math.max(0, Math.min(janelaEditor.inicio, numeroDeLinhas));
  const janelaFim = Math.max(janelaInicio, Math.min(janelaEditor.fim, numeroDeLinhas));
  const digitosNumeroLinhas = String(numeroDeLinhas).length;
  const larguraGutter = Math.ceil(digitosNumeroLinhas * 13 * 0.6 * escalaFonte) + 16;
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
  const linhasDestacadas = useMemo(() => {
    const resultado = [];
    for (let i = janelaInicio; i < janelaFim; i++) {
      const texto = linhasAtivas[i] !== undefined ? linhasAtivas[i] : '';
      resultado.push({ i, texto, partes: tokenizarLinha(texto, regexLinguagemAtiva) });
    }
    return resultado;
  }, [linhasAtivas, janelaInicio, janelaFim, regexLinguagemAtiva]);

  // Trocou de tela (home ↔ workspace): começa com histórico limpo, pra um
  // projeto novo nunca herdar passos de outro que tenha os mesmos caminhos.
  useEffect(() => { historicoRef.current = {}; }, [etapa]);

  // Trocou de arquivo ativo (aba nova, ou fechou uma aba e caiu noutra):
  // a janela de linhas desenhadas volta pro topo, senão ficaria mostrando
  // as linhas de onde o arquivo anterior estava rolado.
  useEffect(() => {
    scrollYEditorRef.current = 0;
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
    const a = Keyboard.addListener(evMostrar, (e) => setAlturaTeclado((e && e.endCoordinates && e.endCoordinates.height) || 0));
    const b = Keyboard.addListener(evEsconder, () => setAlturaTeclado(0));
    return () => { a.remove(); b.remove(); };
  }, []);

  // Com o teclado aberto, rola o editor pra linha do cursor nunca ficar
  // escondida (TextInput multiline dentro de ScrollView não faz isso sozinho).
  useEffect(() => {
    if (!arquivoAtivo || alturaTeclado === 0) return undefined;
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
    }, 140);
    return () => clearTimeout(t);
  }, [caretPos, alturaTeclado, conteudoAtivo, arquivoAtivo, alturaLinhaEditor]);

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
    const atual = janelaEditorRef.current;
    if (linha < atual.inicio + 5 || linha > atual.fim - 5) {
      setJanelaEditor({
        inicio: Math.max(0, linha - OVERSCAN_LINHAS_EDITOR),
        fim: linha + OVERSCAN_LINHAS_EDITOR * 2,
      });
    }
  }, [caretPos, conteudoAtivo, arquivoAtivo]);

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
    if (confirmarSaida) { setConfirmarSaida(false); return; }
    if (cardProjeto) { setCardProjeto(null); return; }
    if (menuOrdenarAberto) { setMenuOrdenarAberto(false); return; }
    if (cardNo) { setCardNo(null); setPastaEmCriacao(false); setNomeNovaPasta(''); return; }
    if (permissoesAberto) { setPermissoesAberto(false); setBuscaPermissao(''); return; }
    if (menuProjetoAberto) { setMenuProjetoAberto(false); return; }
    if (painelCompilacao) { if (!compilando) setPainelCompilacao(false); return; }
    if (sidebarAberta) { setSidebarAberta(false); return; }
    if (etapa === 'workspace') { voltarParaHome(); return; }
    if (etapa === 'config') { setEtapa('home'); return; }
    if (buscaAberta) { fecharBusca(); return; }
    if (abaHome === 'gerados') {
      if (modoSelecaoBuilds) { sairSelecaoBuilds(); return; }
      setAbaHome('apps');
      return;
    }
    if (abaHome === 'aprender') {
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
          <Text style={[studioStyles.tileNumero, ativo && { color: '#ff8a68' }]}>{numero}</Text>
          <MaterialCommunityIcons name={icone} size={20} color={ativo ? '#ff8a68' : COLORS.dim} />
        </View>
        <Text style={[studioStyles.tileRotulo, ativo && { color: COLORS.ink }]}>{rotulo}</Text>
      </TouchableOpacity>
    );
  };

  const renderHero = () => (
    <View style={studioStyles.heroCard}>
      <MaterialCommunityIcons
        name={ultimoProjeto.iconeEscolhido || ICONES_APP_STUDIO[0]}
        size={170}
        color="#ffffff"
        style={studioStyles.heroMarcaDagua}
      />
      <View style={studioStyles.heroTopo}>
        <View style={studioStyles.heroSelo}>
          <MaterialCommunityIcons name="lightning-bolt" size={13} color="#ffdcd2" />
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
        <MaterialCommunityIcons name="play" size={20} color="#4a1a26" />
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
              <MaterialCommunityIcons name="plus" size={22} color="#1a0806" />
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
                <MaterialCommunityIcons name="history" size={22} color="#ff8a68" />
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
                  <MaterialCommunityIcons name={copiado ? 'check' : 'content-copy'} size={16} color="#1a0806" />
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
                              style={[geradosStyles.buildLinha, marcado && { backgroundColor: 'rgba(255,82,39,0.10)' }]}
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
                                  {formatarDataBuildStudio(b.criadoEm)}{b.tamanho ? `  ·  ${formatarTamanhoStudio(b.tamanho)}` : ''}
                                </Text>
                              </View>
                              {!modoSelecaoBuilds && (
                                <>
                                  <TouchableOpacity style={geradosStyles.buildAcao} onPress={() => instalarBuild(b)} activeOpacity={0.8}>
                                    <MaterialCommunityIcons name="cellphone-arrow-down" size={17} color="#8bd450" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[geradosStyles.buildAcao, armado && { backgroundColor: COLORS.error }]}
                                    onPress={() => tocarLixeiraBuild(b)}
                                    activeOpacity={0.8}
                                  >
                                    <MaterialCommunityIcons name={armado ? 'check' : 'trash-can-outline'} size={17} color={armado ? '#1a0806' : COLORS.error} />
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
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#1a0806" />
              <Text style={geradosStyles.barraApagarTexto} numberOfLines={1}>
                {confirmarApagarLote ? `Confirmar: apagar ${qtdSel}` : qtdSel ? `Apagar ${qtdSel}` : 'Apagar'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </>
    );
  };

  const renderAbaAprender = () => (
    <>
      <View style={studioStyles.homeHeader}>
        <View style={{ flex: 1 }}>
          <Text style={studioStyles.homeOverline}>CINDRA-STUDIO</Text>
          <Text style={studioStyles.homeTitulo} numberOfLines={1}>Aprender</Text>
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
      >
        <Text style={aprenderStyles.intro}>
          Toque num exemplo pra ver o código. Depois é só copiar e colar no seu projeto.
        </Text>

        {EXEMPLOS_APRENDER.map((cat) => (
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
                    <MaterialCommunityIcons name={item.icone} size={16} color={ativo ? '#ff8a68' : COLORS.dim} />
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

  // Barra de baixo: "Meus apps", "Aprender" e o botão "Criar".
  const renderNavHome = () => (
    <View style={[studioStyles.navHome, { paddingBottom: Math.max(insets.bottom, 8) + 6 }]}>
      {ABAS_HOME_STUDIO.map((a) => {
        if (a.especial) {
          return (
            <TouchableOpacity key={a.id} style={studioStyles.navBotaoCriar} onPress={abrirTelaConfigNova} activeOpacity={0.85}>
              <MaterialCommunityIcons name="plus" size={20} color="#1a0806" />
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
              color={ativo ? '#ff8a68' : COLORS.dim}
            />
            <Text style={[studioStyles.navAbaTexto, ativo && studioStyles.navAbaTextoAtivo]} numberOfLines={1}>{a.rotulo}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderHome = () => (
    <>
      <View pointerEvents="none" style={studioStyles.homeGlowTop} />
      <View pointerEvents="none" style={studioStyles.homeGlowBottom} />

      {abaHome === 'aprender' ? renderAbaAprender() : abaHome === 'gerados' ? renderAbaGerados() : renderAbaApps()}

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
                  <Text style={[studioStyles.folhaBtnTexto, { color: '#1a0806' }]}>Sair</Text>
                </TouchableOpacity>
              </View>
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
          <View pointerEvents="none" style={[studioStyles.cfgHeroGlow, { backgroundColor: fotoIcone ? COLORS.emberGlow : hexParaRgba(corIcone, 0.55) }]} />
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
                ? <ActivityIndicator size="small" color="#1a0806" />
                : <MaterialCommunityIcons name="camera-plus-outline" size={17} color="#1a0806" />}
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

      {alturaTeclado === 0 && (
        <View style={[studioStyles.cfgFooter, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <TouchableOpacity style={[studioStyles.criarBtn, criandoProjeto && { opacity: 0.7 }]} onPress={criarProjeto} activeOpacity={0.85} disabled={criandoProjeto}>
            {criandoProjeto
              ? <ActivityIndicator size="small" color="#1a0806" />
              : <MaterialCommunityIcons name="rocket-launch-outline" size={19} color="#1a0806" />}
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
        <View pointerEvents="none" style={studioStyles.workspaceGlow} />

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
        <View style={{ flex: 1, paddingBottom: alturaTeclado }}>
          <View style={studioStyles.pathBar}>
            <MaterialCommunityIcons name="folder-outline" size={12} color={COLORS.dim} />
            <Text style={studioStyles.pathBarText} numberOfLines={1} ellipsizeMode="head" maxFontSizeMultiplier={1.1}>{arquivoAtivo.split('/').join(' \u203a ')}</Text>
          </View>
          <ItemAnimadoStudio key={arquivoAtivo} indice={0} style={{ flex: 1 }}>
            <ScrollView
              ref={scrollEditorRef}
              style={{ flex: 1, backgroundColor: '#0a0a0c' }}
              contentContainerStyle={{ paddingBottom: alturaTeclado > 0 ? 24 : Math.max(insets.bottom, 0) + 24 }}
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
                  {Array.from({ length: janelaFim - janelaInicio }).map((_, idx) => {
                    const i = janelaInicio + idx;
                    return (
                      <Text
                        key={i}
                        style={[studioStyles.lineNumberText, { position: 'absolute', top: 14 + i * alturaLinhaEditor, right: 8, width: larguraGutter - 16 }]}
                      >
                        {i + 1}
                      </Text>
                    );
                  })}
                </View>
                <ScrollView
                  horizontal
                  nestedScrollEnabled
                  style={{ flex: 1 }}
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  onLayout={(e) => setLarguraVisivelCodigo(Math.floor(e.nativeEvent.layout.width))}
                >
                  <View style={{ width: larguraCodigo, height: alturaTotalCodigo }}>
                    <TextInput
                      style={[studioStyles.codeInput, { position: 'absolute', left: 0, top: trechoIni * alturaLinhaEditor, width: larguraCodigo }]}
                      value={textoTrecho}
                      onChangeText={alterarTrecho}
                      onSelectionChange={(e) => {
                        if (Date.now() < ignorarSelecaoAteRef.current) return;
                        setCaretPos(trechoInfoRef.current.offset + e.nativeEvent.selection.end);
                      }}
                      selection={selecaoTrecho}
                      multiline
                      autoCapitalize="none"
                      autoCorrect={false}
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
                      {linhasDestacadas.map(({ i, texto, partes }) => (
                        <Text
                          key={i}
                          numberOfLines={1}
                          allowFontScaling={false}
                          style={[studioStyles.codeHighlightLine, { top: 14 + i * alturaLinhaEditor }]}
                        >
                          {texto === ''
                            ? ' '
                            : partes.map((p, idx) => (
                              <Text key={idx} allowFontScaling={false} style={p.c ? { color: p.c } : null}>{p.t}</Text>
                            ))}
                        </Text>
                      ))}
                    </View>
                  </View>
                </ScrollView>
              </View>
            </ScrollView>
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
            <MaterialCommunityIcons name="folder-outline" size={16} color="#1a0806" />
            <Text style={studioStyles.emptyEditorBtnText}>Ver arquivos</Text>
          </TouchableOpacity>
        </View>
      )}

      {sidebarAberta && (
        <PainelLateralStudio onFechar={() => setSidebarAberta(false)}>
          {(fechar) => (
            <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) }}>
              <View pointerEvents="none" style={studioStyles.sidebarGlow} />
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
                        <MaterialCommunityIcons name="check" size={18} color="#1a0806" />
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
                <MaterialCommunityIcons name="play-circle-outline" size={18} color="#1a0806" />
                <Text style={studioStyles.instalarBtnText}>{tipoBuild === 'release' ? 'Compilar release' : 'Compilar debug'}</Text>
              </TouchableOpacity>
            </>
          )}
        </FolhaInferiorStudio>
      )}

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
                <View style={[studioStyles.compileHeaderGlow, { backgroundColor: corEstado }]} pointerEvents="none" />
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
                  <MaterialCommunityIcons name="cellphone-arrow-down" size={18} color="#1a0806" />
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
    <View style={{ flex: 1, backgroundColor: etapa === 'workspace' ? '#000000' : COLORS.sheet, paddingTop: insets.top }}>
      {etapa === 'home' ? renderHome() : etapa === 'config' ? renderConfig() : renderWorkspace()}
    </View>
  );
}

export { NoticeCardHost };
export default CindraStudioScreen;
