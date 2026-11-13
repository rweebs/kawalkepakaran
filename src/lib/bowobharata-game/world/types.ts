import type { KurukshetraScene } from '../../bowobharata/KurukshetraScene';
import type { GameState } from '../engine';

/** The scene's game handle (KurukshetraScene's `game`), as the world's layers use it. */
export type SceneGame = NonNullable<KurukshetraScene['game']>;

/** One part of the game world in the scene: drawn from the engine's state each frame (`time`: the scene's clock, s), then freed. */
export interface Layer {
  sync(s: GameState, time: number): void;
  dispose(): void;
}
