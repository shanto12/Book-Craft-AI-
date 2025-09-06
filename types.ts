export interface Chapter {
  title: string;
  summary: string;
  imagePrompt: string;
  epigraph: string; // A short, fictional quote to start the chapter
  content: string;
  imageUrl: string;
}

export interface Author {
  name: string;
  bio: string;
  alsoByAuthor: string[];
}

export interface CharacterProfile {
    name: string;
    role: 'protagonist' | 'antagonist' | 'supporting';
    description: string; // Detailed description of motivations, flaws, appearance, etc.
}

export interface Book {
  title: string;
  author: Author;
  plotSummary: string; 
  preface: string;
  dedication: string; // A dedication for the book
  mainCharacters: CharacterProfile[];
  coverImageUrl: string;
  coverPrompt: string;
  chapters: Chapter[];
  backCoverBlurb: string;
}

export enum GenerationStatus {
  Idle,
  GeneratingPlot,
  GeneratingChapters,
  Proofreading,
  GeneratingImages,
  Complete,
  Error,
}