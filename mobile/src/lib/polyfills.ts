// amazon-cognito-identity-js relies on crypto.getRandomValues for the SRP auth
// flow, which React Native does not provide out of the box. Importing this
// polyfill installs a native-backed implementation on the global object.
//
// This MUST be imported before any Cognito code runs — app/_layout.tsx imports
// it first, before anything else.
import 'react-native-get-random-values';
