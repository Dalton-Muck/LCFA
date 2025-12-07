import { useState } from 'react';
import type { ClusteredCommunity } from '../types/clustered-classes';
import type { CollegeGroup } from '../utils/community-parser';
import './CommunitySelector.css';

interface CommunitySelectorProps {
  collegeGroups: CollegeGroup[];
  selectedCommunity: ClusteredCommunity | null;
  onCommunitySelect: (community: ClusteredCommunity | null) => void;
}

export function CommunitySelector({
  collegeGroups,
  selectedCommunity,
  onCommunitySelect,
}: CommunitySelectorProps) {
  const [selectedCollege, setSelectedCollege] = useState<string>('');

  const handleCollegeChange = (collegeName: string) => {
    setSelectedCollege(collegeName);
    onCommunitySelect(null);
  };

  const handleCommunityChange = (community: ClusteredCommunity) => {
    onCommunitySelect(community);
  };

  const selectedCollegeGroup = collegeGroups.find(
    (cg) => cg.collegeName === selectedCollege
  );

  return (
    <div className="community-selector">
      {/* College Dropdown */}
      <div className="selector-group">
        <label htmlFor="college-select">College:</label>
        <select
          id="college-select"
          value={selectedCollege}
          onChange={(e) => handleCollegeChange(e.target.value)}
          className="selector-input"
        >
          <option value="">Select a college...</option>
          {collegeGroups.map((cg) => (
            <option key={cg.collegeName} value={cg.collegeName}>
              {cg.collegeName}
            </option>
          ))}
        </select>
      </div>

      {/* Community Dropdown */}
      {selectedCollegeGroup && (
        <div className="selector-group">
          <label htmlFor="community-select">Community:</label>
          <select
            id="community-select"
            value={selectedCommunity?.clusterCallNumber || ''}
            onChange={(e) => {
              const clusterCallNumber = parseInt(e.target.value);
              const community = selectedCollegeGroup.communities.find(
                (c) => c.clusterCallNumber === clusterCallNumber
              );
              handleCommunityChange(community || null);
            }}
            className="selector-input"
            disabled={!selectedCollege}
          >
            <option value="">Select a community...</option>
            {selectedCollegeGroup.communities.map((community) => (
              <option
                key={community.clusterCallNumber}
                value={community.clusterCallNumber}
              >
                {community.communities} ({community.classes.length} classes)
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

