import { AppRegistry } from "react-native";
import { MobileApp } from "./src/mobile/MobileApp";
import { name as appName } from "./app.json";

AppRegistry.registerComponent(appName, () => MobileApp);
