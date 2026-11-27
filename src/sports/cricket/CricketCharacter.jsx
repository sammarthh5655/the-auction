/**
 * Cricket character entry point used by the reveal stage and the character creator.
 * Renders the rigged CC0 human model (CricketCharacterGLB). If the model files are missing or fail to
 * load, it falls back to the all-primitive low-poly figure so the reveal never breaks.
 */
import { Component, Suspense } from 'react';
import CricketCharacterGLB from './CricketCharacterGLB.jsx';
import CricketCharacterLowPoly from './CricketCharacterLowPoly.jsx';

class Fallback extends Component {
  constructor(p) { super(p); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.warn('[character] model failed to load, using low-poly figure:', e?.message || e); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export default function CricketCharacter(props) {
  const low = <CricketCharacterLowPoly {...props} />;
  return (
    <Fallback fallback={low}>
      <Suspense fallback={null}>
        <CricketCharacterGLB {...props} />
      </Suspense>
    </Fallback>
  );
}
