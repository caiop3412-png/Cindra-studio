# apk-builder — compilador de APK do CindraStudio

Compila o projeto Android do CindraStudio (aapt2 → ECJ → D8 → apksig) direto no celular.
Só arm64 (aparelhos de 32 bits não são suportados) e Android 8+ (API 26).

## Instalar (uma vez)

1. Copie esta pasta pra `modules/apk-builder` do projeto (junto do `overlay-bubble`).

2. **aapt2** (binário arm64 estático):
   - Baixe `https://github.com/lzhiyong/android-sdk-tools/releases/download/35.0.2/android-sdk-tools-static-aarch64.zip`
   - Dentro do zip, pegue `build-tools/aapt2`
   - Renomeie pra `libaapt2.so` e coloque em
     `modules/apk-builder/android/src/main/jniLibs/arm64-v8a/libaapt2.so`
   (o nome `.so` é proposital: só assim o Android deixa executar o arquivo no Android 10+)

3. **app.json** — o Android precisa extrair a lib pra pasta nativa:
   `npx expo install expo-build-properties` e, em `plugins`:
   ```json
   ["expo-build-properties", { "android": { "useLegacyPackaging": true } }]
   ```

4. Rode `eas build -p android` (rebuild nativo, uma vez só).

5. Depois disso, o App-v2.js funciona por OTA normal.

## Como funciona

▶ no CindraStudio grava o projeto em disco, baixa o `platform-35_r01.zip` do Google
na primeira vez (~60 MB, extrai só o `android.jar` e apaga o zip), roda o pipeline e
mostra log + erros (toque num erro pra abrir o arquivo). Depois, "Instalar" abre o
instalador do Android.

## Se der problema

- `libaapt2.so não está no app` → passo 2 ou 3 faltando. Confira também se o build foi arm64.
- `Permission denied` / `error=13` ao rodar o aapt2 → o arquivo não foi extraído (passo 3).
- Erro do Gradle dizendo que uma versão de `ecj`/`r8`/`apksig` não existe → troque pela mais nova no `android/build.gradle`.
- Erro de arquivos duplicados `META-INF/...` no build → adicione no app `packaging { resources { pickFirsts += ['META-INF/MANIFEST.MF'] } }` (ou o arquivo citado).
- `NoSuchMethodError`/`NoClassDefFoundError` vindo do D8 → o R8 novo usa APIs de Java que o Android não tem; use um R8 mais antigo (ex: 3.3.28).
- `Unsupported class file major version` no ECJ → ECJ velho lendo android.jar novo; tente `org.eclipse.jdt:ecj:3.26.0`.
- "resources.arsc … alinhado" ao instalar → alinhamento do zip falhou (`montarApkAlinhado`).
- App gerado não instala por cima do anterior → a chave de assinatura mudou (Cindra foi desinstalado/dados limpos). Desinstale o app gerado antes.
