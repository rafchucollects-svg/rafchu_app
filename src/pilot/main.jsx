/* global __PILOT_RELEASE__ */
import React from 'react';
import { createRoot } from 'react-dom/client';
import PilotApp from './PilotApp.jsx';
import './pilot.css';

class PilotBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main style={{maxWidth:600,margin:'3rem auto',padding:24,fontFamily:'system-ui'}}><h1>Your saved test work is still here</h1><p>This screen could not open. Use recovery to inspect saved operations and export this browser’s workspace.</p><a href="./recovery.html">Open recovery</a><p><a href="https://rafchu-tcg-app.web.app" target="_blank" rel="noreferrer">Open the current live app</a></p></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<PilotBoundary><PilotApp/><footer className="release-stamp">Test build {__PILOT_RELEASE__.version} · {__PILOT_RELEASE__.commit.slice(0,8)} · <a href="./recovery.html">Recovery</a></footer></PilotBoundary>);
