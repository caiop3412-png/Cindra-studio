import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  PanResponder,
  Animated,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Opcional, igual ao resto do Studio: sem o pacote o editor avisa o que instalar.
let ImageManipulator = null;
try { ImageManipulator = require('expo-image-manipulator'); } catch (e) { ImageManipulator = null; }

// Paleta do Cindra (mesmos tons do CindraStudio.js).
const COR = {
  ink: '#ffffff',
  dim: 'rgba(255,255,255,0.6)',
  line: 'rgba(255,255,255,0.14)',
  lineSoft: 'rgba(255,255,255,0.07)',
  panel: '#120b27',
  panel2: '#1a1236',
  ember: '#b43cff',
  azul: '#4f46ff',
  pink: '#ff2fc6',
  glow: 'rgba(180,60,255,0.55)',
  erro: '#ff6b6b',
};

const ZOOM_MAX = 6;
const LADO_MAX_TRABALHO = 2048; // foto gigante é reduzida na entrada pra o editor ficar leve

const PROPORCOES = [
  { id: '1:1', rotulo: '1:1', r: 1, icone: 'crop-square', dica: 'Ícone' },
  { id: '4:5', rotulo: '4:5', r: 4 / 5, icone: 'crop-portrait', dica: 'Retrato' },
  { id: '3:4', rotulo: '3:4', r: 3 / 4, icone: 'crop-portrait', dica: 'Foto' },
  { id: '16:9', rotulo: '16:9', r: 16 / 9, icone: 'crop-landscape', dica: 'Banner' },
  { id: '9:16', rotulo: '9:16', r: 9 / 16, icone: 'cellphone', dica: 'Splash' },
  { id: '3:2', rotulo: '3:2', r: 3 / 2, icone: 'crop-landscape', dica: 'Paisagem' },
];

const GUIAS = [
  { id: 'quadrado', rotulo: 'Quadrado', icone: 'square-outline' },
  { id: 'arredondado', rotulo: 'Arredondado', icone: 'square-rounded-outline' },
  { id: 'circulo', rotulo: 'Círculo', icone: 'circle-outline' },
];

const TAMANHOS = [256, 512, 1024];

function limitar(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function distancia(a, b) {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

// Barra deslizante feita à mão (sem pacote extra).
function Regua({ valor, min, max, onChange }) {
  const [larg, setLarg] = useState(1);
  const ref = useRef({ larg: 1, base: 0, min, max, onChange });
  ref.current.larg = larg;
  ref.current.min = min;
  ref.current.max = max;
  ref.current.onChange = onChange;

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const r = ref.current;
        const p = limitar(e.nativeEvent.locationX / r.larg, 0, 1);
        r.base = p;
        r.onChange(r.min + p * (r.max - r.min));
      },
      onPanResponderMove: (e, g) => {
        const r = ref.current;
        const p = limitar(r.base + g.dx / r.larg, 0, 1);
        r.onChange(r.min + p * (r.max - r.min));
      },
    })
  ).current;

  const p = limitar((valor - min) / (max - min), 0, 1);
  return (
    <View style={s.reguaArea} onLayout={(e) => setLarg(Math.max(1, e.nativeEvent.layout.width))} {...pan.panHandlers}>
      <View style={s.reguaInterna} pointerEvents="none">
        <View style={s.reguaTrilho} />
        <View style={[s.reguaPreenchido, { width: `${p * 100}%` }]} />
        <View style={[s.reguaBolinha, { left: p * (larg - 22) }]} />
      </View>
    </View>
  );
}

function Botao({ icone, rotulo, onPress, ativo, desabilitado }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      style={({ pressed }) => [s.ferramenta, ativo && s.ferramentaAtiva, pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] }, desabilitado && { opacity: 0.35 }]}
    >
      <MaterialCommunityIcons name={icone} size={22} color={ativo ? COR.ember : COR.ink} />
      <Text style={[s.ferramentaTxt, ativo && { color: COR.ember }]} numberOfLines={1}>{rotulo}</Text>
    </Pressable>
  );
}

/**
 * Editor de imagem do Studio.
 *
 * props:
 *  - visible, uri
 *  - onCancelar()
 *  - onConfirmar({ uri, width, height })  → PNG já cortado e redimensionado
 *  - proporcaoInicial: '1:1' | '4:5' | '3:4' | '16:9' | '9:16' | '3:2'
 *  - tamanhoInicial: 256 | 512 | 1024 (largura final em px)
 *  - titulo
 */
export default function EditorImagem({
  visible,
  uri,
  onCancelar,
  onConfirmar,
  proporcaoInicial = '1:1',
  tamanhoInicial = 512,
  titulo = 'Editar foto',
}) {
  const insets = useSafeAreaInsets();
  const { width: telaW } = useWindowDimensions();

  const [original, setOriginal] = useState(null); // { uri, w, h } depois do preparo
  const [atual, setAtual] = useState(null); // imagem de trabalho (já girada/espelhada)
  const [proporcao, setProporcao] = useState(proporcaoInicial);
  const [aba, setAba] = useState('cortar');
  const [guia, setGuia] = useState('quadrado');
  const [grade, setGrade] = useState(true);
  const [tamanho, setTamanho] = useState(tamanhoInicial);
  const [palco, setPalco] = useState({ w: 0, h: 0 });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [zoomUi, setZoomUi] = useState(1);
  const [dica, setDica] = useState(true);

  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const zoomAnim = useRef(new Animated.Value(1)).current;
  const est = useRef({ x: 0, y: 0, z: 1 });
  const zoomUiRef = useRef(1);
  const dados = useRef({ atual: null, frame: { w: 1, h: 1 }, cover: 1 });

  const prop = PROPORCOES.find((p) => p.id === proporcao) || PROPORCOES[0];

  // Moldura de recorte: cabe no palco respeitando a proporção.
  const frame = useMemo(() => {
    const pad = 26;
    const maxW = Math.max(40, palco.w - pad * 2);
    const maxH = Math.max(40, palco.h - pad * 2);
    let fw;
    let fh;
    if (maxW / maxH > prop.r) {
      fh = maxH;
      fw = fh * prop.r;
    } else {
      fw = maxW;
      fh = fw / prop.r;
    }
    return { w: Math.round(fw), h: Math.round(fh) };
  }, [palco.w, palco.h, prop.r]);

  const cover = atual ? Math.max(frame.w / atual.w, frame.h / atual.h) : 1;
  dados.current = { atual, frame, cover };

  // Move/zoom mantendo a imagem sempre cobrindo a moldura.
  const aplicar = useCallback((x, y, z) => {
    const d = dados.current;
    if (!d.atual) return;
    const zz = limitar(z, 1, ZOOM_MAX);
    const sc = d.cover * zz;
    const mx = Math.max(0, (d.atual.w * sc - d.frame.w) / 2);
    const my = Math.max(0, (d.atual.h * sc - d.frame.h) / 2);
    const xx = limitar(x, -mx, mx);
    const yy = limitar(y, -my, my);
    est.current = { x: xx, y: yy, z: zz };
    tx.setValue(xx);
    ty.setValue(yy);
    zoomAnim.setValue(zz);
    if (Math.abs(zz - zoomUiRef.current) > 0.01) {
      zoomUiRef.current = zz;
      setZoomUi(zz);
    }
  }, [tx, ty, zoomAnim]);

  // Gestos: 1 dedo arrasta, 2 dedos dão zoom (pinça).
  const toque = useRef({ n: 0, x0: 0, y0: 0, z0: 1, dx0: 0, dy0: 0, d0: 1 });
  const gesto = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        toque.current.n = 0;
        setDica(false);
      },
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        const n = t.length;
        const k = toque.current;
        if (n !== k.n) {
          k.n = n;
          k.x0 = est.current.x;
          k.y0 = est.current.y;
          k.z0 = est.current.z;
          k.dx0 = g.dx;
          k.dy0 = g.dy;
          k.d0 = n >= 2 ? distancia(t[0], t[1]) || 1 : 1;
          return;
        }
        const x = k.x0 + (g.dx - k.dx0);
        const y = k.y0 + (g.dy - k.dy0);
        if (n >= 2) aplicar(x, y, (k.z0 * distancia(t[0], t[1])) / k.d0);
        else aplicar(x, y, est.current.z);
      },
    })
  ).current;

  // Prepara a foto: aplica a orientação do EXIF e reduz se for enorme.
  useEffect(() => {
    if (!visible || !uri) return undefined;
    let vivo = true;
    setErro('');
    setAtual(null);
    setOriginal(null);
    setProporcao(proporcaoInicial);
    setTamanho(tamanhoInicial);
    setAba('cortar');
    setDica(true);
    if (!ImageManipulator) {
      setErro('Instale o expo-image-manipulator (npx expo install expo-image-manipulator) e gere um build novo.');
      return undefined;
    }
    setOcupado(true);
    (async () => {
      try {
        const base = await ImageManipulator.manipulateAsync(uri, [], { format: ImageManipulator.SaveFormat.PNG, compress: 1 });
        let pronto = base;
        const maior = Math.max(base.width, base.height);
        if (maior > LADO_MAX_TRABALHO) {
          const acao = base.width >= base.height ? { resize: { width: LADO_MAX_TRABALHO } } : { resize: { height: LADO_MAX_TRABALHO } };
          pronto = await ImageManipulator.manipulateAsync(base.uri, [acao], { format: ImageManipulator.SaveFormat.PNG, compress: 1 });
        }
        if (!vivo) return;
        const info = { uri: pronto.uri, w: pronto.width, h: pronto.height };
        setOriginal(info);
        setAtual(info);
      } catch (e) {
        if (vivo) setErro('Não consegui abrir essa foto. Tente outra imagem.');
      } finally {
        if (vivo) setOcupado(false);
      }
    })();
    return () => { vivo = false; };
  }, [visible, uri]);

  // Imagem nova (ou girada): volta pro centro, sem zoom.
  useEffect(() => {
    if (atual) aplicar(0, 0, 1);
  }, [atual, aplicar]);

  // Trocou a proporção ou o tamanho do palco: reajusta os limites.
  useEffect(() => {
    if (atual) aplicar(est.current.x, est.current.y, est.current.z);
  }, [frame.w, frame.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const transformar = async (acao) => {
    if (!atual || ocupado || !ImageManipulator) return;
    setOcupado(true);
    try {
      const r = await ImageManipulator.manipulateAsync(atual.uri, [acao], { format: ImageManipulator.SaveFormat.PNG, compress: 1 });
      setAtual({ uri: r.uri, w: r.width, h: r.height });
    } catch (e) {
      setErro('Não deu pra aplicar essa ação. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  const girar = (graus) => transformar({ rotate: graus });
  const espelhar = (vertical) =>
    transformar({ flip: vertical ? ImageManipulator.FlipType.Vertical : ImageManipulator.FlipType.Horizontal });
  const restaurar = () => {
    if (original) setAtual({ ...original });
    setProporcao(proporcaoInicial);
  };

  const concluir = async () => {
    if (!atual || ocupado || !ImageManipulator) return;
    setOcupado(true);
    setErro('');
    try {
      const { x, y, z } = est.current;
      const sc = cover * z;
      const sw = frame.w / sc;
      const sh = frame.h / sc;
      const cx = atual.w / 2 - x / sc;
      const cy = atual.h / 2 - y / sc;
      const ox = limitar(Math.round(cx - sw / 2), 0, atual.w - 1);
      const oy = limitar(Math.round(cy - sh / 2), 0, atual.h - 1);
      const w = Math.max(1, Math.min(Math.round(sw), atual.w - ox));
      const h = Math.max(1, Math.min(Math.round(sh), atual.h - oy));
      const acoes = [{ crop: { originX: ox, originY: oy, width: w, height: h } }];
      // Só reduz; nunca estica uma foto pequena.
      if (w > tamanho) acoes.push({ resize: { width: tamanho } });
      const r = await ImageManipulator.manipulateAsync(atual.uri, acoes, { format: ImageManipulator.SaveFormat.PNG, compress: 1 });
      onConfirmar && onConfirmar({ uri: r.uri, width: r.width, height: r.height });
    } catch (e) {
      setErro('Falhou ao salvar o recorte. Tente de novo.');
    } finally {
      setOcupado(false);
    }
  };

  // Tamanho final estimado (mostrado na etiqueta do palco).
  const saidaW = atual ? Math.min(tamanho, Math.round(frame.w / (cover * zoomUi))) : tamanho;
  const saidaH = Math.round(saidaW / prop.r);

  const fx = (palco.w - frame.w) / 2;
  const fy = (palco.h - frame.h) / 2;
  const raio = guia === 'circulo' ? Math.min(frame.w, frame.h) / 2 : guia === 'arredondado' ? Math.min(frame.w, frame.h) * 0.22 : 2;
  const baseW = atual ? atual.w * cover : 0;
  const baseH = atual ? atual.h * cover : 0;

  return (
    <Modal visible={!!visible} animationType="fade" transparent={false} statusBarTranslucent onRequestClose={onCancelar}>
      <View style={[s.raiz, { paddingTop: insets.top }]}>
        {/* Topo */}
        <View style={s.topo}>
          <Pressable onPress={onCancelar} style={s.topoBtn} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={22} color={COR.ink} />
          </Pressable>
          <Text style={s.titulo} numberOfLines={1}>{titulo}</Text>
          <Pressable onPress={restaurar} style={s.topoBtn} hitSlop={8} disabled={!original}>
            <MaterialCommunityIcons name="restore" size={22} color={original ? COR.ink : COR.dim} />
          </Pressable>
          <Pressable onPress={concluir} disabled={!atual || ocupado} style={[s.concluir, (!atual || ocupado) && { opacity: 0.45 }]}>
            <MaterialCommunityIcons name="check" size={18} color="#fff" />
            <Text style={s.concluirTxt}>Salvar</Text>
          </Pressable>
        </View>

        {/* Palco */}
        <View style={s.palco} onLayout={(e) => setPalco({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...gesto.panHandlers}>
          {atual && palco.w > 0 && (
            <Animated.Image
              source={{ uri: atual.uri }}
              resizeMode="stretch"
              style={{
                position: 'absolute',
                width: baseW,
                height: baseH,
                left: palco.w / 2 - baseW / 2,
                top: palco.h / 2 - baseH / 2,
                transform: [{ translateX: tx }, { translateY: ty }, { scale: zoomAnim }],
              }}
            />
          )}

          {/* Escurece fora da moldura */}
          {palco.w > 0 && (
            <>
              <View pointerEvents="none" style={[s.sombra, { left: 0, top: 0, right: 0, height: fy }]} />
              <View pointerEvents="none" style={[s.sombra, { left: 0, bottom: 0, right: 0, height: fy }]} />
              <View pointerEvents="none" style={[s.sombra, { left: 0, top: fy, width: fx, height: frame.h }]} />
              <View pointerEvents="none" style={[s.sombra, { right: 0, top: fy, width: fx, height: frame.h }]} />

              {/* Moldura */}
              <View
                pointerEvents="none"
                style={[s.moldura, { left: fx, top: fy, width: frame.w, height: frame.h, borderRadius: raio }]}
              >
                {grade && (
                  <>
                    <View style={[s.gradeV, { left: '33.33%' }]} />
                    <View style={[s.gradeV, { left: '66.66%' }]} />
                    <View style={[s.gradeH, { top: '33.33%' }]} />
                    <View style={[s.gradeH, { top: '66.66%' }]} />
                  </>
                )}
              </View>
              {guia === 'quadrado' && (
                <>
                  <View pointerEvents="none" style={[s.canto, { left: fx - 2, top: fy - 2, borderLeftWidth: 4, borderTopWidth: 4 }]} />
                  <View pointerEvents="none" style={[s.canto, { left: fx + frame.w - 22, top: fy - 2, borderRightWidth: 4, borderTopWidth: 4 }]} />
                  <View pointerEvents="none" style={[s.canto, { left: fx - 2, top: fy + frame.h - 22, borderLeftWidth: 4, borderBottomWidth: 4 }]} />
                  <View pointerEvents="none" style={[s.canto, { left: fx + frame.w - 22, top: fy + frame.h - 22, borderRightWidth: 4, borderBottomWidth: 4 }]} />
                </>
              )}
            </>
          )}

          {/* Etiquetas */}
          {atual && (
            <View pointerEvents="none" style={s.etiqueta}>
              <Text style={s.etiquetaTxt}>{saidaW} × {saidaH} px  ·  {zoomUi.toFixed(1)}x</Text>
            </View>
          )}
          {atual && dica && (
            <View pointerEvents="none" style={s.dica}>
              <MaterialCommunityIcons name="gesture-pinch" size={16} color={COR.ink} />
              <Text style={s.dicaTxt}>Arraste e use dois dedos pra dar zoom</Text>
            </View>
          )}

          {(ocupado || !!erro) && (
            <View style={s.cobertura} pointerEvents={ocupado ? 'auto' : 'none'}>
              {ocupado ? (
                <ActivityIndicator size="large" color={COR.ember} />
              ) : (
                <View style={s.erroCaixa}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={20} color={COR.erro} />
                  <Text style={s.erroTxt}>{erro}</Text>
                </View>
              )}
            </View>
          )}
          {!ocupado && !!erro && !atual && (
            <View style={s.cobertura} pointerEvents="none">
              <View style={s.erroCaixa}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={COR.erro} />
                <Text style={s.erroTxt}>{erro}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Painel inferior */}
        <View style={[s.painel, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={s.painelConteudo}>
            {aba === 'cortar' && (
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
                  {PROPORCOES.map((p) => {
                    const on = p.id === proporcao;
                    return (
                      <Pressable key={p.id} onPress={() => setProporcao(p.id)} style={[s.chip, on && s.chipOn]}>
                        <Text style={[s.chipTxt, on && s.chipTxtOn]}>{p.rotulo}</Text>
                        <Text style={[s.chipSub, on && { color: COR.ember }]}>{p.dica}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={s.linhaZoom}>
                  <MaterialCommunityIcons name="magnify-minus-outline" size={20} color={COR.dim} />
                  <View style={{ flex: 1 }}>
                    <Regua valor={zoomUi} min={1} max={ZOOM_MAX} onChange={(z) => aplicar(est.current.x, est.current.y, z)} />
                  </View>
                  <MaterialCommunityIcons name="magnify-plus-outline" size={20} color={COR.dim} />
                </View>
              </View>
            )}

            {aba === 'girar' && (
              <View style={s.linhaFerr}>
                <Botao icone="rotate-left" rotulo="Girar esq." onPress={() => girar(-90)} desabilitado={ocupado || !atual} />
                <Botao icone="rotate-right" rotulo="Girar dir." onPress={() => girar(90)} desabilitado={ocupado || !atual} />
                <Botao icone="flip-horizontal" rotulo="Espelhar" onPress={() => espelhar(false)} desabilitado={ocupado || !atual} />
                <Botao icone="flip-vertical" rotulo="Inverter" onPress={() => espelhar(true)} desabilitado={ocupado || !atual} />
              </View>
            )}

            {aba === 'saida' && (
              <View>
                <Text style={s.rotuloSecao}>Guia do formato</Text>
                <View style={s.linhaFerr}>
                  {GUIAS.map((g) => (
                    <Botao key={g.id} icone={g.icone} rotulo={g.rotulo} ativo={guia === g.id} onPress={() => setGuia(g.id)} />
                  ))}
                  <Botao icone="grid" rotulo="Grade" ativo={grade} onPress={() => setGrade((v) => !v)} />
                </View>
                <Text style={[s.rotuloSecao, { marginTop: 10 }]}>Largura final</Text>
                <View style={s.chips}>
                  {TAMANHOS.map((t) => {
                    const on = t === tamanho;
                    return (
                      <Pressable key={t} onPress={() => setTamanho(t)} style={[s.chip, on && s.chipOn]}>
                        <Text style={[s.chipTxt, on && s.chipTxtOn]}>{t}px</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* Abas */}
          <View style={s.abas}>
            {[
              { id: 'cortar', rotulo: 'Cortar', icone: 'crop' },
              { id: 'girar', rotulo: 'Girar', icone: 'rotate-3d-variant' },
              { id: 'saida', rotulo: 'Formato', icone: 'tune-variant' },
            ].map((a) => {
              const on = aba === a.id;
              return (
                <Pressable key={a.id} onPress={() => setAba(a.id)} style={s.aba}>
                  <MaterialCommunityIcons name={a.icone} size={20} color={on ? COR.ember : COR.dim} />
                  <Text style={[s.abaTxt, on && { color: COR.ember }]}>{a.rotulo}</Text>
                  <View style={[s.abaTraco, on && { backgroundColor: COR.ember }]} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: '#000' },
  topo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 56, gap: 6 },
  topoBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titulo: { flex: 1, color: COR.ink, fontSize: 17, fontWeight: '800', marginLeft: 4 },
  concluir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    backgroundColor: COR.ember,
    shadowColor: COR.pink,
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  concluirTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },

  palco: { flex: 1, backgroundColor: '#05030c', overflow: 'hidden' },
  sombra: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.68)' },
  moldura: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', overflow: 'hidden' },
  gradeV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  gradeH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  canto: { position: 'absolute', width: 24, height: 24, borderColor: COR.pink, borderRadius: 3 },

  etiqueta: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    paddingHorizontal: 12,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(18,11,39,0.85)',
    borderWidth: 1,
    borderColor: COR.line,
    justifyContent: 'center',
  },
  etiquetaTxt: { color: COR.ink, fontSize: 12, fontWeight: '700' },
  dica: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(18,11,39,0.85)',
  },
  dicaTxt: { color: COR.ink, fontSize: 12 },
  cobertura: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  erroCaixa: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '86%', padding: 14, borderRadius: 14, backgroundColor: COR.panel2 },
  erroTxt: { color: COR.ink, fontSize: 13.5, lineHeight: 19, flexShrink: 1 },

  painel: { backgroundColor: COR.panel, borderTopWidth: 1, borderTopColor: COR.line },
  painelConteudo: { minHeight: 118, paddingTop: 14, paddingHorizontal: 14, justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: {
    minWidth: 62,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: COR.lineSoft,
  },
  chipOn: { backgroundColor: 'rgba(180,60,255,0.16)', borderColor: COR.ember },
  chipTxt: { color: COR.ink, fontSize: 14, fontWeight: '800' },
  chipTxtOn: { color: COR.ember },
  chipSub: { color: COR.dim, fontSize: 10.5, marginTop: 1 },
  linhaZoom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },

  linhaFerr: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  ferramenta: {
    flex: 1,
    height: 66,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: COR.lineSoft,
  },
  ferramentaAtiva: { backgroundColor: 'rgba(180,60,255,0.16)', borderColor: COR.ember },
  ferramentaTxt: { color: COR.ink, fontSize: 11.5, fontWeight: '700' },
  rotuloSecao: { color: COR.dim, fontSize: 12, fontWeight: '700', marginBottom: 6 },

  abas: { flexDirection: 'row', paddingTop: 8 },
  aba: { flex: 1, alignItems: 'center', gap: 2, paddingTop: 4 },
  abaTxt: { color: COR.dim, fontSize: 12, fontWeight: '700' },
  abaTraco: { marginTop: 4, width: 28, height: 3, borderRadius: 2, backgroundColor: 'transparent' },

  reguaArea: { height: 36, justifyContent: 'center' },
  reguaInterna: { height: 22, justifyContent: 'center' },
  reguaTrilho: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)' },
  reguaPreenchido: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: COR.ember },
  reguaBolinha: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: COR.ember,
    shadowColor: COR.pink,
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
});
