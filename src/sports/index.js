// Sport pack registry. Add a pack here and it shows up on the home screen.
import cricket from './cricket/pack.js';
import football from './football/pack.js';

export const SPORTS = [cricket, football];
export const getSport = id => SPORTS.find(s => s.id === id) || cricket;
