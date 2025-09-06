export interface Chapter {
  title: string;
  summary: string;
  imagePrompt: string;
  content: string;
  imageUrl: string;
}

export interface Author {
  name: string;
  bio: string;
}

export interface Book {
  title: string;
  author: Author;
  plotSummary: string; // Add plot summary to maintain context
  preface: string;
  coverImageUrl: string;
  coverPrompt: string;
  chapters: Chapter[];
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