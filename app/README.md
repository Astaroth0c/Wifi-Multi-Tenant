# App Android — OrangeWifi (React Native)

Fonte do app de gestão (mesma API REST e permissões do painel web).

## O que está aqui

- `App.jsx` — login com 2FA (TOTP), navegação por abas (Ao vivo, Clientes, Logs, Config).
- `src/api.js` — cliente REST com token em AsyncStorage, URL do servidor configurável na aba Config.
- `src/telas/` — telas do app.

**Importante:** o APK não é compilado neste repositório (não há Android SDK no
ambiente de desenvolvimento). O build e a assinatura são feitos na sua máquina
com Android Studio/SDK, seguindo os passos abaixo.

## Gerar o projeto Android e compilar o APK

Requisitos: Node 18+, JDK 17, Android SDK (Android Studio) com plataforma 34.

```sh
cd app
npm install

# gera a pasta android/ do projeto nativo (uma única vez)
npx @react-native-community/cli init OrangeWifi --skip-install --directory /tmp/rn-base
cp -r /tmp/rn-base/android ./android

# ajuste o nome do pacote se desejar (com.rnbase → com.sualoja.portalcativo)

# compila o APK de release
cd android
./gradlew assembleRelease
```

## Assinar o APK (fora da Play Store)

```sh
# gera a chave (uma única vez; guarde a senha!)
keytool -genkeypair -v -storetype PKCS12 \
  -keystore portalcativo.keystore -alias portalcativo \
  -keyalg RSA -keysize 2048 -validity 10000

# android/gradle.properties
MYAPP_UPLOAD_STORE_FILE=portalcativo.keystore
MYAPP_UPLOAD_KEY_ALIAS=portalcativo
MYAPP_UPLOAD_STORE_PASSWORD=sua_senha
MYAPP_UPLOAD_KEY_PASSWORD=sua_senha
```

No `android/app/build.gradle`, o bloco de assinatura de release já existe no
template do React Native — basta apontar para as variáveis acima. O APK sai em
`android/app/build/outputs/apk/release/app-release.apk`.

Distribuição: copie o APK para os celulares e instale habilitando
"Instalar apps desconhecidos". Nada é publicado na Play Store.

## Segurança no app

- Token de 30 min em AsyncStorage; sem cache de dados sensíveis (as telas
  buscam sempre da API).
- "Sair" no app revoga a sessão local; para revogar o token remotamente use
  `POST /v1/admin/tokens/revogar` (botão no painel web) ou troque a senha.
