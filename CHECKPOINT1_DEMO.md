# Checkpoint 1: GenAI App Rapid Prototyping - Course Schedule Generator

## Overview

GenAI-powered application that generates conflict-free class schedules from user-selected courses using a local Ollama LLM model. The system selects one class from each course while avoiding time overlaps.

## Model Inputs

### Course Data Structure

JSON array of courses with classes containing:

```json
[
  {
    "subject": "COMS",
    "catalogNumber": "1030",
    "classes": [
      {
        "classNumber": 10064,
        "subject": "COMS",
        "catalogNumber": "1030",
        "times": "MWF 08:35-09:30",
        "seats": "25/25"
      }
    ]
  }
]
```

**Key Fields:**
- `subject`: Course subject code (e.g., "COMS", "CS")
- `catalogNumber`: Course number (e.g., "1030")
- `classNumber`: Unique class section identifier
- `times`: Schedule string format "Days StartTime-EndTime" (e.g., "MWF 09:40-10:35", "TuTh 09:30-10:50")

### Prompt Structure

The model receives instructions to:
- Generate exactly 5 unique schedules
- Select one class from each course per schedule
- Avoid time conflicts between classes from different courses
- Vary classes from courses with multiple options

## Model Outputs

### Success Output

JSON array of schedules:

```json
[
  {
    "scheduleNumber": 1,
    "classes": [
      {
        "subject": "COMS",
        "catalogNumber": "1030",
        "classNumber": 10064
      },
      {
        "subject": "CS",
        "catalogNumber": "4560",
        "classNumber": 1257
      }
    ]
  }
  // ... up to 5 schedules
]
```

### Error Output

```json
{
  "error": true,
  "message": "Cannot generate schedules without overlapping classes."
}
```

## Manual Prompt Example

```
You are a course schedule generator. Given 2 courses, generate conflict-free schedules.

YOUR PRIMARY GOAL: Generate EXACTLY 5 UNIQUE schedules.

CRITICAL REQUIREMENTS:
1. YOU MUST GENERATE 5 SCHEDULES
2. Each schedule MUST have exactly 2 classes (one from each course)
3. NO TWO CLASSES FROM DIFFERENT COURSES CAN OVERLAP IN TIME
4. Classes within the SAME course may overlap - that's fine
5. ALL SCHEDULES MUST BE UNIQUE
6. For courses with only 1 class, use that same class in ALL schedules
7. For courses with multiple classes, vary the selection across schedules

TIME CONFLICT DETECTION:
Two classes from DIFFERENT courses conflict if:
- They share at least one common day (e.g., both have "M" or "Tu")
- AND their time ranges overlap (e.g., "09:40-10:35" overlaps with "10:00-11:00")

Examples:
- CONFLICT: "MWF 09:40-10:35" and "MWF 10:00-11:00" - share days and times overlap
- NO CONFLICT: "MWF 09:40-10:35" and "TuTh 10:00-11:00" - different days
- NO CONFLICT: "MWF 08:35-09:30" and "MWF 09:40-10:35" - times don't overlap

STEP-BY-STEP:
1. Schedule 1: Pick one class from each course, check for conflicts
2. Schedule 2: Keep same classes from 1-option courses, vary from multi-option courses
3. Continue for Schedules 3-5, ensuring uniqueness

Courses and available classes with their times:
[Course data JSON]

Return ONLY valid JSON - either error object or array of schedules.
```

## Acceptance Criteria

### Functional Requirements

- ✅ Generate up to 5 unique schedules
- ✅ One class per course per schedule
- ✅ No time conflicts between classes from different courses
- ✅ All schedules are unique (at least one different classNumber)
- ✅ For single-option courses, use same class in all schedules
- ✅ For multi-option courses, vary selections across schedules

### Output Validation

- ✅ Valid JSON format
- ✅ Array of schedules (or error object)
- ✅ Each schedule has `scheduleNumber` and `classes` array
- ✅ Each class includes `subject`, `catalogNumber`, `classNumber`

## Demonstration Example

**Input:**
- COMS 1030 (50+ classes with various times)
- CS 4560 (1 class: MWF 09:40-10:35)

**Expected Output:**
- Schedule 1: COMS #10064 (TuTh 09:30-10:50), CS #1257 (MWF 09:40-10:35)
- Schedule 2: COMS #10046 (MWF 08:35-09:30), CS #1257 (MWF 09:40-10:35)
- Schedule 3: COMS #9953 (MWF 10:45-11:40), CS #1257 (MWF 09:40-10:35)
- Schedule 4: COMS #9964 (TuTh 08:00-09:20), CS #1257 (MWF 09:40-10:35)
- Schedule 5: COMS #10079 (TuTh 11:00-12:20), CS #1257 (MWF 09:40-10:35)

**Validation:**
- ✅ Each schedule has 2 classes (one per course)
- ✅ CS 4560 class appears in all schedules (only one option)
- ✅ COMS 1030 classes vary (multiple options)
- ✅ No time conflicts verified
- ✅ All schedules unique

## Feasibility

The system demonstrates feasibility through:
- ✅ Clear input/output specifications
- ✅ Effective prompt engineering for conflict detection
- ✅ Structured JSON output format
- ✅ Successful generation of unique, conflict-free schedules

## Technical Implementation

- **API**: Ollama `http://localhost:11434/api/generate`
- **Model**: Configurable (default: `llama3`)
- **Request**: JSON with `model`, `prompt`, `stream: false`, `format: 'json'`
- **Response**: JSON with `response` string containing generated schedules
