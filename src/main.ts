import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import Antd from 'ant-design-vue';
import VueKonva from 'vue-konva';

const app = createApp(App);
app.use(Antd);
app.use(VueKonva);
app.mount('#app');
