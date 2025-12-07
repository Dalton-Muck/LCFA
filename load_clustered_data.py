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
    
    return {
        'classNumber': safe_int(class_number),
        'subject': str(subject) if subject is not None else None,
        'catalogNumber': catalog_str,  # Keep as string to handle alphanumeric
        'section': safe_int(section),
        'component': str(clean_value(row.get('Component'))) if clean_value(row.get('Component')) is not None else None,
        'title': str(clean_value(row.get('Title'))) if clean_value(row.get('Title')) is not None else None,
        'meetTimeStart': normalize_time(clean_value(row.get('Meet Time Start'))),
        'meetTimeEnd': normalize_time(clean_value(row.get('Meet Time End'))),
        'days': str(clean_value(row.get('Days'))) if clean_value(row.get('Days')) is not None else None,
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

