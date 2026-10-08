import React from 'react';
import { createRoot } from 'react-dom/client';
import Workbench from '../components/safetriage/workbench';
import '../app/globals.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Workbench /></React.StrictMode>,
);
