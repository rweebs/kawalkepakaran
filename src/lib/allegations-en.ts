// English version of src/lib/allegations.ts: claims under examination and their verification status, not findings.
export interface AllegationEn { label: string; claim: string; status: string }

export const ALLEGATIONS_EN: Record<string, AllegationEn> = {
  'gelar-university-of-london': {
    label: 'University of London degree',
    claim: 'A Computer Science degree from the University of London.',
    status: 'The Stimson Center bio only says "studied", and LinkedIn lists the programme without years. Graduation has not been confirmed; a verification request has been sent to the university.',
  },
  'pendidikan-binus': {
    label: 'education history in Indonesia',
    claim: 'Higher-education history in Indonesia.',
    status: 'The PDDikti record shows Bina Nusantara University (distance-learning Management, entered 2019) with a latest status of applied to resign. This says nothing about education elsewhere.',
  },
  'jabatan-korika-unesco': {
    label: 'titles at KORIKA and UNESCO',
    claim: 'Executive Director of KORIKA and Project Manager of the UNESCO AI Readiness Assessment.',
    status: 'Published on a personal site and other profiles. A statement said to come from UNESCO Jakarta, relayed indirectly, says there was no contract or consultancy; the role at KORIKA needs to be confirmed with KORIKA.',
  },
  'penghargaan-fellowship': {
    label: 'awards and fellowship',
    claim: '"AI Innovator of the Year" and Responsible AI Fellow (Stimson Center / Microsoft).',
    status: 'The awarding body and year of the award are not stated in the profiles. No confirmation yet from the institutions named.',
  },
  'dosen-tim-bergelar': {
    label: 'lecturer status and a team of doctorate holders',
    claim: 'Described as a lecturer, and as leading a team holding Doctorate/PhD degrees.',
    status: 'Third-party coverage repeats the "lecturer" claim without verifying it. No official teaching assignment or list of team members has been seen.',
  },
};
