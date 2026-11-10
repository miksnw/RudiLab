/** Общие одиночки приложения. Экраны импортируют store отсюда; в тестах создают свой createStore(). */
import { createStore } from './store.js';

export const store = createStore();
