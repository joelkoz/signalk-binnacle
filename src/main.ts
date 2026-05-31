import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import { mount } from 'svelte';
import './app.css';
import App from './app/App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount element');

const app = mount(App, { target });

export default app;
