// Type definitions for clustered classes data from JSON

export interface ClusteredClass {
  classNumber: number;
  subject: string;
  catalogNumber: string;
  section: number;
  component: string;
  title: string;
  meetTimeStart: string;
  meetTimeEnd: string;
  days: string;
}

export interface ClusteredCommunity {
  clusterCallNumber: number;
  pfxNumSection: string;
  college: string;
  communities: string;
  course: string;
  seats?: number;
  classes: ClusteredClass[];
}

export type ClusteredClassesData = ClusteredCommunity[];

