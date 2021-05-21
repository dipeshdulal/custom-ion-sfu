/**
 * @format
 */

import { NavigationContainer } from "@react-navigation/native";
import React from "react";
import { AppRegistry } from 'react-native';
import { App } from './App';
import { name as appName } from './app.json';

const InitialComponent = () => {
    return (
        <NavigationContainer>
            <App />
        </NavigationContainer>
    )
}

AppRegistry.registerComponent(appName, () => InitialComponent);
