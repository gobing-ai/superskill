# Agent Color Reference

Semantic color palette for subagent UI identification, organized by functional category.

## Quick Reference Card

```
┌─────────────────────────────────────────────────────┐
│              AGENT COLOR REFERENCE                   │
├─────────────────────────────────────────────────────┤
│ 🟦 blue       - Code generation                     │
│ 🟪 purple     - Planning & coordination             │
│ 🟥 crimson    - Code review & validation            │
│ 🟧 orange     - Architecture                        │
│ 🟩 teal       - Design                              │
├─────────────────────────────────────────────────────┤
│ Gray - Documentation | Yellow - Testing             │
└─────────────────────────────────────────────────────┘
```

## Standard CSS Colors (Recommended)

| Category | Colors | Hex Codes |
|----------|--------|-----------|
| **Blue - Code Generation** | blue, cyan, navy, skyblue | #0000FF, #00FFFF, #000080, #87CEEB |
| **Purple - Planning** | purple, violet, orchid, magenta | #800080, #EE82EE, #DA70D6, #FF00FF |
| **Red - Review** | red, crimson, coral, tomato | #FF0000, #DC143C, #FF7F50, #FF6347 |
| **Orange - Architecture** | orange, gold, amber, yellow | #FFA500, #FFD700, #FFBF00, #FFFF00 |
| **Green/Teal - Design** | teal, turquoise, green, emerald | #008080, #40E0D0, #008000, #50C878 |
| **Neutral - Documentation** | gray, silver, slate | #808080, #C0C0C0, #708090 |
| **Yellow - Testing** | yellow, lemon, khaki | #FFFF00, #FAFA33, #F0E68C |

---

## Detailed Color Palette by Category

### Blue Shades - Code Generation

**Primary:**
| Name | Hex | Usage |
|------|-----|-------|
| blue | #0000FF | Primary code generation |
| navy | #000080 | Deep implementation |
| royalblue | #4169E1 | Enterprise code |
| steelblue | #4682B4 | Infrastructure code |

**Secondary:**
| Name | Hex | Usage |
|------|-----|-------|
| cyan | #00FFFF | Multi-model code gen |
| skyblue | #87CEEB | Light code tasks |
| cornflowerblue | #6495ED | Frontend code |
| dodgerblue | #1E90FF | API development |
| cadetblue | #5F9EA0 | Legacy code maintenance |

---

### Purple Shades - Planning & Coordination

**Primary:**
| Name | Hex | Usage |
|------|-----|-------|
| purple | #800080 | Planning and coordination |
| violet | #EE82EE | Light orchestration |
| indigo | #4B0082 | Deep planning |
| blueviolet | #8A2BE2 | Multi-agent coordination |

**Secondary:**
| Name | Hex | Usage |
|------|-----|-------|
| orchid | #DA70D6 | Meta-coordination |
| magenta | #FF00FF | High-level orchestration |
| plum | #DDA0DD | Workflow planning |
| thistle | #D8BFD8 | Light coordination tasks |
| slateblue | #6A5ACD | Project management |

---

### Red Shades - Review & Validation

**Primary:**
| Name | Hex | Usage |
|------|-----|-------|
| crimson | #DC143C | Code review |
| red | #FF0000 | Critical review |
| firebrick | #B22222 | Security audit |
| darkred | #8B0000 | Deep validation |

**Secondary:**
| Name | Hex | Usage |
|------|-----|-------|
| coral | #FF7F50 | Light review |
| tomato | #FF6347 | Quality assurance |
| salmon | #FA8072 | Code inspection |
| indianred | #CD5C5C | Legacy code review |
| maroon | #800000 | Static analysis |

---

### Orange/Yellow Shades - Architecture

**Primary:**
| Name | Hex | Usage |
|------|-----|-------|
| orange | #FFA500 | Architecture |
| gold | #FFD700 | Solution design |
| amber | #FFBF00 | High-level planning |

**Secondary:**
| Name | Hex | Usage |
|------|-----|-------|
| darkorange | #FF8C00 | Systems architecture |
| tangerine | #F08000 | Component design |
| goldenrod | #DAA520 | Technical architecture |
| chocolate | #D2691E | Backend architecture |
| peru | #CD853F | Infrastructure design |

---

### Green/Teal Shades - Design & Testing

**Primary:**
| Name | Hex | Usage |
|------|-----|-------|
| teal | #008080 | UI/UX design |
| green | #008000 | Testing |
| turquoise | #40E0D0 | Frontend design |
| emerald | #50C878 | Test coverage |

**Secondary:**
| Name | Hex | Usage |
|------|-----|-------|
| seagreen | #2E8B57 | Integration testing |
| mediumseagreen | #3CB371 | Unit testing |
| limegreen | #32CD32 | Performance testing |
| forestgreen | #228B22 | End-to-end testing |
| olivedrab | #6B8E23 | Acceptance testing |

---

### Neutral Shades - Documentation & Utilities

| Name | Hex | Usage |
|------|-----|-------|
| gray | #808080 | Documentation |
| silver | #C0C0C0 | Utilities |
| slate | #708090 | Infrastructure |
| darkgray | #A9A9A9 | Technical docs |
| lightgray | #D3D3D3 | Guides |
| dimgray | #696969 | API documentation |

---

### Yellow Shades - Testing (Alternative)

| Name | Hex | Usage |
|------|-----|-------|
| yellow | #FFFF00 | Testing |
| khaki | #F0E68C | Light testing |
| gold | #FFD700 | Premium testing |
| lemonchiffon | #FFFACD | Debugging |
| palegoldenrod | #EEE8AA | Test fixtures |

---

## Agent Color Assignment Guide

When assigning colors to new agents, follow this decision tree:

```
                    NEW AGENT
                       │
          ┌────────────┴────────────┐
          │                         │
     Code-related?              Non-code?
          │                         │
          ▼                         ▼
     ┌─────────┐            ┌──────────────┐
     │ Blue?   │            │ What type?   │
     └────┬────┘            └──────┬───────┘
          │                        │
          │                ┌───────┴────────┐
          │                │                │
          │                ▼                ▼
          │         Planning         Review/Validate
          │                │                │
          │                ▼                ▼
          │           Purple              Red
          │
          ▼
     ┌─────────┐
     │ What    │
     │ kind?   │
     └────┬────┘
          │
     ┌────┴────────┐
     │             │
     ▼             ▼
Generation   Infrastructure
     │             │
     ▼             ▼
Blue/Cyan    Teal/Green
```

---

## Quick Lookup Table

| Agent Type | Color | Hex | Category |
|------------|-------|-----|----------|
| Code generation | blue | #0000FF | Code Generation |
| Workflow planning | purple | #800080 | Planning |
| Code review | crimson | #DC143C | Review |
| Solution architecture | orange | #FFA500 | Architecture |
| UI/UX design | teal | #008080 | Design |
| Agent evaluators | crimson | #DC143C | Review |
| Agent creators | blue | #0000FF | Code Generation |
| Skill evaluators | coral | #FF7F50 | Review |
| Skill creators | teal | #008080 | Design |

---

## Notes

- All colors are standard CSS color names
- Hex codes provided for reference only
- Use semantic meaning when selecting colors
- Ensure visual distinction between agents in the same plugin
- Test in both light and dark modes
