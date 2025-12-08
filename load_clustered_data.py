"""
Load Excel data and group classes under their communities (LCOM/UC 1900 clusters).

Structure:
- Each community (row with Cluster Call #) contains community info
- Classes (rows without Cluster Call #) are nested under their community
- Only specified fields are included for classes
"""

import pandas as pd
import json
import math
from typing import List, Dict, Any, Optional
from datetime import datetime, time


def clean_value(v):
    """Clean NaN and None values"""
    if isinstance(v, float) and math.isnan(v):
        return None
    if pd.isna(v):
        return None
    return v


def normalize_time(time_value) -> Optional[str]:
    """
    Normalize time to HH:MM AM/PM format.
    Handles:
    - datetime.time objects
    - Strings in "HH:MM:SS" format (24-hour)
    - Strings in "HH:MM AM/PM" format (12-hour)
    - Strings in "HH:MM:SS AM/PM" format
    """
    if time_value is None:
        return None
    
    # If it's already a datetime.time object
    if isinstance(time_value, time):
        hour = time_value.hour
        minute = time_value.minute
        period = "AM" if hour < 12 else "PM"
        if hour == 0:
            hour = 12
        elif hour > 12:
            hour = hour - 12
        return f"{hour:02d}:{minute:02d} {period}"
    
    # Convert to string if not already
    time_str = str(time_value).strip()
    if not time_str or time_str.lower() in ['nan', 'none', '']:
        return None
    
    # Check if it already has AM/PM
    has_am_pm = 'AM' in time_str.upper() or 'PM' in time_str.upper()
    
    if has_am_pm:
        # Already in 12-hour format, just normalize
        # Remove extra spaces and ensure format is HH:MM AM/PM
        time_str = time_str.upper()
        # Extract time and period
        parts = time_str.split()
        if len(parts) >= 2:
            time_part = parts[0]
            period = parts[-1]  # Get AM or PM
            
            # Parse time part (could be HH:MM or HH:MM:SS)
            if ':' in time_part:
                time_components = time_part.split(':')
                hour = int(time_components[0])
                minute = int(time_components[1])
                return f"{hour:02d}:{minute:02d} {period}"
    else:
        # 24-hour format, convert to 12-hour
        # Could be "HH:MM:SS" or "HH:MM"
        if ':' in time_str:
            parts = time_str.split(':')
            try:
                hour = int(parts[0])
                minute = int(parts[1])
                
                # Convert to 12-hour format
                period = "AM" if hour < 12 else "PM"
                if hour == 0:
                    hour = 12
                elif hour > 12:
                    hour = hour - 12
                
                return f"{hour:02d}:{minute:02d} {period}"
            except (ValueError, IndexError):
                return time_str  # Return as-is if parsing fails
    
    # If we can't parse it, return as-is
    return time_str


def safe_int(value):
    """Safely convert value to int, return None if not possible"""
    if value is None:
        return None
    try:
        return int(float(str(value)))
    except (ValueError, TypeError):
        return None


def extract_class_data(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract only the specified fields from a class row.
    Returns None if required fields are missing.
    Handles both 2024 and 2025 column name variations.
    Handles multiple meeting times (e.g., MWF at one time, Th at another).
    """
    # Handle both "Class #" (2025) and "Class Number" (2024)
    class_number = clean_value(row.get('Class #')) or clean_value(row.get('Class Number'))
    subject = clean_value(row.get('Subject'))
    # Handle both "Catalog #" (2025) and "Catalog Number" (2024)
    catalog_number = clean_value(row.get('Catalog #')) or clean_value(row.get('Catalog Number'))
    
    # Skip if this doesn't look like a class row (missing key fields)
    if class_number is None or subject is None or catalog_number is None:
        return None
    
    # Catalog number might be alphanumeric (e.g., "1500L"), so keep as string
    catalog_str = str(catalog_number) if catalog_number is not None else None
    
    # Handle both "Section" (2025) and "Class Section" (2024)
    section = clean_value(row.get('Section')) or clean_value(row.get('Class Section'))
    
    # Get days and check if there are multiple meeting patterns
    days_str = str(clean_value(row.get('Days'))) if clean_value(row.get('Days')) is not None else None
    
    # Check for multiple meeting times - look for multiple time columns or combined format
    # Try to find multiple time start/end columns (e.g., "Meet Time Start", "Meet Time Start 2", etc.)
    meet_time_starts = []
    meet_time_ends = []
    
    # Get primary times
    primary_start = normalize_time(clean_value(row.get('Meet Time Start')))
    primary_end = normalize_time(clean_value(row.get('Meet Time End')))
    
    if primary_start and primary_end:
        meet_time_starts.append(primary_start)
        meet_time_ends.append(primary_end)
    
    # Check for additional time columns - look for patterns in all column names
    # Common patterns: "Meet Time Start 2", "Meet Time End 2", "Start Time 2", "End Time 2", etc.
    all_columns = list(row.keys())
    
    # Find all time start columns
    time_start_cols = [col for col in all_columns if 'start' in col.lower() and 'time' in col.lower()]
    time_end_cols = [col for col in all_columns if 'end' in col.lower() and 'time' in col.lower()]
    
    # Sort to get them in order (e.g., "Meet Time Start", "Meet Time Start 2", etc.)
    time_start_cols.sort()
    time_end_cols.sort()
    
    # Extract all time pairs
    for i in range(1, min(len(time_start_cols), len(time_end_cols))):
        start_time = normalize_time(clean_value(row.get(time_start_cols[i])))
        end_time = normalize_time(clean_value(row.get(time_end_cols[i])))
        
        if start_time and end_time:
            meet_time_starts.append(start_time)
            meet_time_ends.append(end_time)
    
    # Also check for numbered columns (e.g., "Meet Time Start 2", "Meet Time End 2")
    for i in range(2, 5):  # Check up to 4 time slots
        start_col = f'Meet Time Start {i}'
        end_col = f'Meet Time End {i}'
        alt_start_col = f'Meet Time Start{i}'
        alt_end_col = f'Meet Time End{i}'
        
        start_time = (normalize_time(clean_value(row.get(start_col))) or 
                     normalize_time(clean_value(row.get(alt_start_col))))
        end_time = (normalize_time(clean_value(row.get(end_col))) or 
                   normalize_time(clean_value(row.get(alt_end_col))))
        
        if start_time and end_time:
            # Avoid duplicates
            if (start_time, end_time) not in zip(meet_time_starts, meet_time_ends):
                meet_time_starts.append(start_time)
                meet_time_ends.append(end_time)
    
    # If we have multiple day groups (separated by semicolon) and multiple times, match them
    # Otherwise, use the primary time for all day groups
    if days_str and ';' in days_str and len(meet_time_starts) > 1:
        # Multiple day groups and multiple times - format as "Days1 Time1-Time2; Days2 Time3-Time4"
        day_groups = [d.strip() for d in days_str.split(';')]
        time_ranges = []
        for i, day_group in enumerate(day_groups):
            if i < len(meet_time_starts) and i < len(meet_time_ends):
                time_ranges.append(f"{day_group} {meet_time_starts[i]}-{meet_time_ends[i]}")
            elif len(meet_time_starts) > 0 and len(meet_time_ends) > 0:
                # Use primary time if not enough times for all day groups
                time_ranges.append(f"{day_group} {meet_time_starts[0]}-{meet_time_ends[0]}")
        
        # For backward compatibility, keep primary times and format days with times
        formatted_days = days_str
        formatted_start = meet_time_starts[0] if meet_time_starts else None
        formatted_end = meet_time_ends[0] if meet_time_ends else None
    else:
        # Single time or single day group - use standard format
        formatted_days = days_str
        formatted_start = meet_time_starts[0] if meet_time_starts else None
        formatted_end = meet_time_ends[0] if meet_time_ends else None
    
    return {
        'classNumber': safe_int(class_number),
        'subject': str(subject) if subject is not None else None,
        'catalogNumber': catalog_str,  # Keep as string to handle alphanumeric
        'section': safe_int(section),
        'component': str(clean_value(row.get('Component'))) if clean_value(row.get('Component')) is not None else None,
        'title': str(clean_value(row.get('Title'))) if clean_value(row.get('Title')) is not None else None,
        'meetTimeStart': formatted_start,
        'meetTimeEnd': formatted_end,
        'days': formatted_days,
        # Store all meeting times if multiple exist
        'meetingTimes': [
            {'days': day_groups[i] if days_str and ';' in days_str and i < len(day_groups := [d.strip() for d in days_str.split(';')]) else days_str,
             'start': start, 'end': end}
            for i, (start, end) in enumerate(zip(meet_time_starts, meet_time_ends))
        ] if len(meet_time_starts) > 1 else None,
    }


def extract_community_info(row: Dict[str, Any]) -> Dict[str, Any]:
    """Extract community information from a row with Cluster Call # (yellow header row)"""
    cluster_call = clean_value(row.get('Cluster Call #'))
    
    # Try to convert to int, but keep as string if it's not numeric
    cluster_call_number = None
    if cluster_call is not None:
        try:
            cluster_call_number = int(float(str(cluster_call)))
        except (ValueError, TypeError):
            # If it's not a number, skip this row as a community header
            return None
    
    # Extract all community-level fields (from the yellow header row)
    community_info = {
        'clusterCallNumber': cluster_call_number,
        'pfxNumSection': str(clean_value(row.get('PFX/NUM section\n'))) if clean_value(row.get('PFX/NUM section\n')) is not None else None,
        'college': str(clean_value(row.get('College'))) if clean_value(row.get('College')) is not None else None,
        'communities': str(clean_value(row.get('Communities'))) if clean_value(row.get('Communities')) is not None else None,
        'course': str(clean_value(row.get('Course'))) if clean_value(row.get('Course')) is not None else None,
        'seats': safe_int(clean_value(row.get('Seats'))),
        'sentToReg': clean_value(row.get('Sent to Reg')),
    }
    
    # Remove None values to keep JSON clean
    return {k: v for k, v in community_info.items() if v is not None}


def group_classes_by_community(file_path: str, sheet_name: str = 'Primary') -> List[Dict[str, Any]]:
    """
    Load Excel and group classes under their communities.
    
    Logic:
    1. Rows with 'Cluster Call #' are community headers
    2. Subsequent rows without 'Cluster Call #' are classes in that community
    3. Continue until we hit another row with 'Cluster Call #'
    """
    # Load the Excel file
    df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl')
    
    # Convert to list of dictionaries
    records = df.to_dict(orient='records')
    
    communities = []
    current_community = None
    current_classes = []
    
    for record in records:
        cluster_call = clean_value(record.get('Cluster Call #'))
        
        # Check if this is a valid community header (has numeric Cluster Call #)
        is_community_header = False
        if cluster_call is not None:
            try:
                # Try to convert to number - if it works, it's a community header
                int(float(str(cluster_call)))
                is_community_header = True
            except (ValueError, TypeError):
                # Not a number, so it's not a community header
                is_community_header = False
        
        # If this row has a valid Cluster Call #, it's a new community
        if is_community_header:
            # Save previous community if it exists
            if current_community is not None:
                communities.append({
                    **current_community,
                    'classes': current_classes
                })
            
            # Start new community
            community_info = extract_community_info(record)
            if community_info is not None:
                current_community = community_info
                current_classes = []
                
                # Also check if this row itself is a class (some communities might have class data)
                class_data = extract_class_data(record)
                if class_data is not None:
                    current_classes.append(class_data)
        
        # If this row doesn't have Cluster Call #, it's a class in the current community
        else:
            if current_community is not None:
                class_data = extract_class_data(record)
                if class_data is not None:
                    current_classes.append(class_data)
    
    # Don't forget the last community
    if current_community is not None:
        communities.append({
            **current_community,
            'classes': current_classes
        })
    
    return communities


def export_to_json(data: Any, output_path: str):
    """Export data to JSON file"""
    def json_serializer(obj):
        """Handle special types for JSON serialization"""
        import datetime
        if isinstance(obj, float) and math.isnan(obj):
            return None
        if isinstance(obj, pd.Timestamp):
            return obj.isoformat()
        if isinstance(obj, datetime.time):
            return obj.isoformat()
        if isinstance(obj, datetime.date):
            return obj.isoformat()
        if pd.isna(obj):
            return None
        raise TypeError(f"Type {type(obj)} not serializable")
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, default=json_serializer, ensure_ascii=False)


if __name__ == "__main__":
    excel_file = "Copy of LC Clusters 2024-8-5 (1).xlsx"
    output_file = "data/clustered_classes.json"
    
    print("=" * 80)
    print("LOADING AND GROUPING CLASSES BY COMMUNITY")
    print("=" * 80)
    
    print("\nLoading Excel file...")
    communities = group_classes_by_community(excel_file, sheet_name='Primary')
    
    print(f"\n✓ Found {len(communities)} communities")
    
    # Show some statistics
    total_classes = sum(len(c['classes']) for c in communities)
    print(f"✓ Total classes: {total_classes}")
    
    # Show examples
    print("\n" + "=" * 80)
    print("EXAMPLE COMMUNITIES")
    print("=" * 80)
    
    for i, community in enumerate(communities[:3]):
        print(f"\nCommunity {i+1}:")
        print(f"  Cluster Call #: {community.get('clusterCallNumber')}")
        print(f"  Community: {community.get('communities')}")
        print(f"  College: {community.get('college')}")
        print(f"  Course: {community.get('course')}")
        print(f"  Number of classes: {len(community.get('classes', []))}")
        
        if community.get('classes'):
            print(f"  First class:")
            first_class = community['classes'][0]
            print(f"    - {first_class.get('subject')} {first_class.get('catalogNumber')} "
                  f"Section {first_class.get('section')} "
                  f"({first_class.get('component')})")
            print(f"      {first_class.get('title')}")
            print(f"      {first_class.get('days')} {first_class.get('meetTimeStart')}-{first_class.get('meetTimeEnd')}")
    
    # Export to JSON
    print("\n" + "=" * 80)
    print("EXPORTING TO JSON")
    print("=" * 80)
    
    export_to_json(communities, output_file)
    print(f"\n✓ Exported to {output_file}")
    print(f"✓ Structure: List of communities, each with nested classes")
    print(f"✓ Each class contains only: classNumber, subject, catalogNumber, section, component, title, meetTimeStart, meetTimeEnd, days")

