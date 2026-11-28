// Football characters use the shared rigged-human renderer with the football kit + football poses.
import './poses.js';
import CricketCharacter from '../cricket/CricketCharacter.jsx';

export default function FootballCharacter(props) {
  const character = props.character ? { ...props.character, kit: 'football' } : props.character;
  return <CricketCharacter {...props} character={character} />;
}
