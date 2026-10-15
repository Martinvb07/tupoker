import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import { loadMe } from './lib/store.js';
import './styles/base.css';

loadMe().then(() => createApp(App).use(router).mount('#app'));
