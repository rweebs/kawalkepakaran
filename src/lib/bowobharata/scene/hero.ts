import * as THREE from 'three';
import { instantiate, type LoadedModels, type Rig } from './models';

export interface GearInput {
  /** The head bone's orientation (relative to the figure) when the gear was authored, standing upright at rest. */
  restQ: THREE.Quaternion;
  /** The head bone's orientation now. */
  nowQ: THREE.Quaternion;
  /** The head bone's position now, relative to the figure. */
  bonePos: THREE.Vector3;
  /** From the bone to the head's centre, along the head's own up. */
  headLift: number;
  /** The gear's authored position relative to the head's centre, with the head upright. */
  offset: THREE.Vector3;
  authoredQ: THREE.Quaternion;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Where a piece of headgear goes when the head has turned or tilted: the head's rotation since rest, applied around the head's
 * centre. It only needs the rotation relative to rest, so it does not matter which way the bone's own axes point.
 */
export function gearAt(i: GearInput): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
  const turn = i.nowQ.clone().multiply(i.restQ.clone().invert());
  const position = i.bonePos.clone().add(UP.clone().multiplyScalar(i.headLift).applyQuaternion(turn)).add(i.offset.clone().applyQuaternion(turn));
  return { position, quaternion: turn.multiply(i.authoredQ) };
}

/** A procedural figure's body replaced by the real mannequin; call `update(dt)` each frame to animate it and carry the headgear. */
export interface Hero { rig: Rig; update(dt: number): void }

const HEAD_LIFT = 0.11;

/**
 * Replaces a procedural figure's body with the real skinned mannequin playing `clip`, painted in `skin`. Everything the caller
 * added to the figure afterwards (garments, gear) stays; only the parts the figure tagged as body are hidden. Pieces listed in
 * `headgear` (crown, hair, beard...) were authored around `headCenter` and are moved with the animated head.
 */
export function dressHero(figure: THREE.Group, models: LoadedModels, clip: string, skin: string, headgear: readonly THREE.Object3D[] = [], headCenter = new THREE.Vector3()): Hero {
  figure.traverse((n) => { if (n.userData.body) n.visible = false; });
  const rig = instantiate(models.base, { height: 1.8, faceBones: ['DEF-foot.L', 'DEF-toe.L'] });
  rig.tint({ M_Main: skin, M_Joints: skin }, { roughness: 0.55, metalness: 0 });
  rig.play(clip);
  figure.add(rig.root);

  const head = rig.bone('DEF-head');
  const bonePose = (q: THREE.Quaternion, p: THREE.Vector3) => {
    if (!head) return;
    figure.updateMatrixWorld(true);
    q.copy(figure.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(head.getWorldQuaternion(new THREE.Quaternion())));
    p.copy(figure.worldToLocal(head.getWorldPosition(new THREE.Vector3())));
  };
  const restQ = new THREE.Quaternion();
  const restP = new THREE.Vector3();
  bonePose(restQ, restP);
  const authored = headgear.map((g) => ({ g, offset: g.position.clone().sub(headCenter), q: g.quaternion.clone() }));
  const nowQ = new THREE.Quaternion();
  const nowP = new THREE.Vector3();

  return {
    rig,
    update(dt) {
      rig.mixer.update(dt);
      if (!head || authored.length === 0) return;
      bonePose(nowQ, nowP);
      for (const a of authored) {
        const at = gearAt({ restQ, nowQ, bonePos: nowP, headLift: HEAD_LIFT, offset: a.offset, authoredQ: a.q });
        a.g.position.copy(at.position);
        a.g.quaternion.copy(at.quaternion);
      }
    },
  };
}
