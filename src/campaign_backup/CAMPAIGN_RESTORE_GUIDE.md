# Campaign Mode Archive & Restoration Guide

This directory preserves the entire 6-World Campaign Mode codebase and assets for Pixel Run.

## Archived Components
- src/campaign_backup/campaign.ts: Campaign levels definitions, progress storage (pixeldash.campaign.v1), level seeds, and attempt recording.
- src/campaign_backup/CampaignModal.tsx: Full Geometry Dash-style level showcase modal with 6 bespoke 4:3 pixel art canvases and CampaignVictoryModal.

## Restoring Campaign Mode
To re-enable Campaign Mode:
1. Copy src/campaign_backup/CampaignModal.tsx back to src/components/CampaignModal.tsx.
2. Copy src/campaign_backup/campaign.ts back to src/game/campaign.ts.
3. In src/components/Overlays.tsx, re-add the Campaign button on the StartScreen (CAMPAIGN 1-6).
4. In src/App.tsx, uncomment/re-add startCampaignLevel, CampaignModal, and CampaignVictoryModal.
5. In src/game/engine.ts, restore startCampaignRun(levelIndex) and goal completion check.
