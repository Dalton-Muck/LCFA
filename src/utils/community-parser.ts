/**
 * Utility functions for parsing and organizing community data
 */

import type { ClusteredCommunity } from '../types/clustered-classes';

export interface CollegeGroup {
  collegeName: string;
  communities: ClusteredCommunity[];
}

/**
 * Filter out UC 1900 classes from a community
 */
function filterUC1900Classes(community: ClusteredCommunity): ClusteredCommunity {
  return {
    ...community,
    classes: community.classes.filter(
      (cls) => !(cls.subject === 'UC' && cls.catalogNumber === '1900')
    ),
  };
}

/**
 * Organize communities by college only (no program grouping)
 * Also filters out UC 1900 classes from each community
 */
export function organizeByCollege(
  communities: ClusteredCommunity[]
): CollegeGroup[] {
  // Filter out UC 1900 classes and group by college
  const collegeMap = new Map<string, ClusteredCommunity[]>();
  
  communities.forEach((community) => {
    // Filter out UC 1900 classes
    const filteredCommunity = filterUC1900Classes(community);
    
    // Only include communities that have classes after filtering
    if (filteredCommunity.classes.length > 0) {
      const collegeName = filteredCommunity.college.trim() || 'Unknown';
      if (!collegeMap.has(collegeName)) {
        collegeMap.set(collegeName, []);
      }
      collegeMap.get(collegeName)!.push(filteredCommunity);
    }
  });
  
  // Convert to array and sort
  const collegeGroups: CollegeGroup[] = Array.from(collegeMap.entries())
    .map(([collegeName, communities]) => ({
      collegeName,
      communities: communities.sort((a, b) => 
        a.communities.localeCompare(b.communities)
      ),
    }))
    .sort((a, b) => a.collegeName.localeCompare(b.collegeName));
  
  return collegeGroups;
}

