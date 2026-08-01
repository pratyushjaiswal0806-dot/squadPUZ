# SquadPuzzle Product Requirements Document

## 1. Document Information

| Field | Value |
|---|---|
| Project Name | SquadPuzzle |
| Version | 1.1 |
| Status | MVP PRD |
| Author | Senior Product Manager |
| Last Updated | July 30, 2026 |
| Stakeholders | Product Management, Engineering Leads, Design, QA |
| Source of Truth | This document is the product source of truth. `SquadPuzzle_TRD.md` derives technical requirements from this PRD. |

### Document Purpose

This PRD defines what SquadPuzzle MVP must do, for whom, and how success is measured. It is written to be decomposed into implementation prompts: each numbered functional requirement (Section 10), UX specification (Section 12), and user flow (Section 14) maps to one or more buildable work units. When generating prompts from this document, treat P0 requirements as blocking, resolved constants in the glossary as non-negotiable, and open questions in Section 20 as using the documented defaults until explicitly changed.

### Glossary Of Resolved Constants

| Constant | Value |
|---|---|
| Room code length | 8 characters, case-insensitive |
| Room code charset | `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (excludes `0`, `1`, `I`, `L`, `O`) |
| Room code entropy | ~853 billion combinations ($31^8$) |
| Room capacity | 6 active connected players; grace sessions do not count toward capacity |
| Room TTL | 24 hours from creation |
| Idle early expiration | 15 consecutive minutes with 0 active participants |
| Upload max size | 10 MB |
| Upload staging TTL | 10 minutes |
| Image min shortest side | 800 px |
| Image max dimension | 6000 px (downscale if safe) |
| Supported aspect ratio | 0.5 to 2.0 (1:2 through 2:1) |
| Grid sizes | 4x4 through 10x10 (integer only) |
| Snap threshold | 25% of shorter piece bounding-box side, center-to-center |
| Lock grace period | 60 seconds after disconnect |
| AFK lock auto-release | 90 seconds with zero movement while connected |
| Reconnect retry schedule | 1s, 2s, 4s, 8s, 15s; stop after 5 attempts or 30 seconds |
| Movement intent rate | 20 updates/second from client; server tick 15–20 Hz |
| Minimum desktop viewport | 1024 x 700 CSS pixels |
| Reconnect identity | Persisted `sessionId` + room code; display name is not used for identity matching |

## 2. Executive Summary

### Product Overview

SquadPuzzle is a browser-based, real-time collaborative jigsaw puzzle product for small remote groups. A room creator uploads a personal raster image, selects a supported grid size, and receives a short auto-generated room code. Other players join with that code and a display name, then collaborate on the same shared puzzle board in real time.

The MVP is anonymous, desktop-first, and ephemeral. It requires no account, login, installation, profile, friend list, or persistent identity. Rooms remain available for 24 hours from creation and are permanently deleted after expiration.

### Elevator Pitch

SquadPuzzle lets friends, families, and casual teams turn a personal image into a real-time multiplayer jigsaw puzzle within seconds, using only a browser, a room code, and display names.

### Vision Statement

SquadPuzzle will become the default casual social activity for remote groups: lightweight enough to start as easily as sharing a code, and engaging enough to feel like sitting around a physical puzzle table together. The intended experience is frictionless togetherness: pieces are visible, the board is visible, the objective is self-evident, and no tutorial is required.

### Mission Statement

SquadPuzzle's mission is to remove the barriers between the impulse to play together and the act of collaborating in real time. The product will deliver a simple loop: upload, share, solve, and repeat within a private 24-hour room.

## 3. Problem Statement

### Current Landscape And Pain Points

The current online jigsaw puzzle landscape does not adequately serve real-time collaborative play.

Single-player web puzzles provide polished browser experiences but isolate users. Social interaction is limited to sharing a completion time after the fact.

Asynchronous multiplayer puzzles allow turn-taking or parallel independent solving, but they lack the immediacy, coordination, and shared manipulation that define true cooperation.

Screen-sharing workarounds force one person to control the puzzle while others give verbal instructions. This removes agency from most participants and makes the experience cumbersome.

The core pain points are:

- Installation friction: downloads, accounts, and permissions prevent spontaneous play.
- Identity overhead: friend lists, passwords, and profiles add unnecessary setup for one-off sessions.
- Lack of real-time synchronization: simultaneous piece manipulation requires conflict resolution and authoritative state.
- No personal content: pre-made libraries feel impersonal compared with users' own photos, memes, or shared memories.
- Session persistence gaps: disconnections often force groups to restart or abandon sessions.

### Why Real-Time Collaboration Matters

Real-time collaboration changes puzzles from solitary tasks into shared social activities. Multiple players can sort, claim, move, and place pieces at the same time while seeing each other's actions. Server-enforced piece ownership prevents conflict, and visible ownership indicators create shared spatial awareness.

The product assumes players communicate outside SquadPuzzle through tools such as video calls, group chats, Discord, Zoom, SMS, or similar channels. SquadPuzzle provides the shared puzzle surface, not an in-app communication system.

### Market Gap

The market gap is a low-friction, private, real-time collaborative jigsaw puzzle experience using personal images. Existing products either prioritize single-player solving, asynchronous play, competitive modes, content libraries, or screen-sharing workarounds. SquadPuzzle addresses the gap by combining personal image upload, anonymous room-code access, server-authoritative real-time interaction, and 24-hour ephemeral persistence.

## 4. Product Goals

### Business Goals

| Goal | Measurement | Target |
|---|---:|---:|
| Validate collaborative puzzle demand | Average player count per room | >= 2.5 |
| Drive successful group sessions | Completion rate for rooms with 2+ players | > 70% |
| Keep sessions lightweight and time-bounded | Median session duration from creation to completion or abandonment | 10-30 minutes |
| Reduce abandonment | Percentage of rooms where all players disconnect and never return before expiration | < 20% |

### User Goals

| Goal | Measurement | Target |
|---|---:|---:|
| Start playing quickly | Time from landing page to active gameplay | < 30 seconds |
| Join without account friction | Mandatory form fields beyond display name and room code | 0 |
| Collaborate without piece conflicts | Server-enforced exclusive lock prevention | 100% of simultaneous manipulation conflicts prevented |
| Experience responsive play | Perceived latency for piece updates under normal conditions | < 100ms |
| Recover from disruption | Successful reconnection and state recovery within grace period | > 95% |

### Engineering Goals

| Goal | Measurement | Target |
|---|---:|---:|
| Maintain authoritative consistency | State divergence incidents | 0 |
| Preserve room state during lifecycle | Room uptime within 24-hour window | 99.9% |
| Meet join responsiveness | Time from code entry to rendered interactive board | < 5 seconds |
| Meet upload and generation responsiveness | Upload plus puzzle generation for supported file sizes | < 5 seconds under normal conditions |
| Enforce room isolation | State leakage between rooms | 0 incidents |

## 5. Non-Goals

The MVP will not include the features listed below. These items are explicitly out of scope in the source overview and must not be designed, implemented, or implied by MVP flows.

- User accounts, OAuth, social login, persistent identity, profiles, friend lists, or avatars.
- Global leaderboards, competitive ranking, achievements, or progression systems.
- Spectator mode, solo play mode, ghost replay, or racing modes.
- Generated share cards, result images, or social media composition pipelines.
- Daily curated puzzles, pre-made puzzle libraries, or AI-generated images.
- Cosmetic themes, visual customization, backgrounds, or piece-style options.
- Mobile-optimized touch controls or responsive mobile gestures.
- In-app chat, voice, or video communication.
- Piece rotation mechanics.
- Custom, irregular, or non-integer grid sizes.
- Room extension, archiving, or saving beyond the 24-hour TTL.
- Image editing, cropping, rotating, or filtering tools.
- Monetization, payments, subscriptions, advertisements, premium features, or paid tiers.

## 6. Success Metrics (KPIs)

| Metric | Definition | Target |
|---|---|---:|
| Average Completion Rate | Percentage of created rooms that reach puzzle completion before expiration. | > 70% |
| Average Room Creation Time | Time from landing page to functional room, including upload and generation. | < 30 seconds |
| Average Join Time | Time from entering a room code to fully rendered, interactive board. | < 5 seconds |
| Successful Reconnect Percentage | Percentage of disconnections that result in successful rejoin and state recovery within the grace period. | > 95% |
| Gameplay Responsiveness | Median latency between a player releasing a piece and all other clients receiving the updated position. | < 100ms |
| Player Count per Room | Average number of unique players who join a room. | >= 2.5 |
| Room Abandonment Rate | Percentage of rooms where all players disconnect and never return before expiration. | < 20% |
| Snap Accuracy | Percentage of piece releases that result in a successful snap on the first attempt. | > 60% |
| Error Rate | Percentage of user actions, including uploads, joins, claims, and moves, that result in an error state. | < 1% |
| Session Duration | Median time from room creation to completion or abandonment. | 10-30 minutes |

### Analytics

Analytics must measure MVP health, reliability, and gameplay quality without creating persistent identity, user profiles, social graphs, leaderboards, achievements, or cross-session player tracking. Events must be room-scoped and session-scoped only, and retained no longer than required for aggregate product analytics consistent with the 24-hour room data lifecycle.

Raw analytics events are retained for 30 days in aggregate form, then purged. No event is retained beyond 30 days. Analytics must not enable cross-session player tracking or persistent identity.

| Event | Trigger | Required Properties |
|---|---|---|
| Upload Started | Creator selects an image and begins upload. | Room creation attempt ID, file size bucket, client browser type, timestamp. |
| Upload Completed | Upload completes and passes initial file-size and type checks. | Room creation attempt ID, file size bucket, image format, upload duration, timestamp. |
| Upload Failed | Upload fails, is cancelled, times out, or is rejected. | Room creation attempt ID, failure reason, file size bucket when available, image format when available, timestamp. |
| Grid Size Selected | Creator selects a grid size. | Room creation attempt ID, selected grid size, timestamp. |
| Puzzle Generated | Puzzle generation completes successfully. | Room ID, grid size, piece count, generation duration, normalized image aspect ratio bucket, timestamp. |
| Room Created | Room is created with an active room code. | Room ID, grid size, piece count, creation duration, timestamp. |
| Room Joined | Player is admitted to a room. | Room ID, anonymous session ID, current player count, join duration, browser type, timestamp. |
| Room Left | Player intentionally leaves, closes the tab, navigates away, disconnects, or is removed due to expiration. | Room ID, anonymous session ID, reason, elapsed room time, timestamp. |
| Room Expired | Room reaches 24 hours from creation and is deleted. | Room ID, completion status, final player count, elapsed room time, timestamp. |
| Piece Claimed | Server grants a piece lock. | Room ID, anonymous session ID, piece ID, grid size, elapsed room time, timestamp. |
| Piece Released | Player releases a piece outside snap threshold. | Room ID, anonymous session ID, piece ID, elapsed room time, timestamp. |
| Piece Snapped | Player releases a piece within snap threshold. | Room ID, anonymous session ID, piece ID, distance-to-target bucket, elapsed room time, timestamp. |
| Piece Placed | Server marks a piece placed and immovable. | Room ID, piece ID, placed piece count, total piece count, elapsed room time, timestamp. |
| Puzzle Completed | Server detects all pieces placed. | Room ID, grid size, piece count, solve time, final player count, timestamp. |
| Reconnect Success | Player reconnects and receives full state. | Room ID, anonymous session ID, disconnect duration bucket, locks restored count, timestamp. |
| Reconnect Failure | Player cannot reconnect after retries or reconnects after room expiration. | Room ID when available, anonymous session ID when available, failure reason, retry count, timestamp. |
| Session Duration | Player session ends. | Room ID, anonymous session ID, duration, end reason, timestamp. |
| Solve Time | Puzzle completion occurs. | Room ID, solve time, grid size, final player count, timestamp. |
| Average Players | Room lifecycle ends or expires. | Room ID, unique anonymous session count, peak concurrent count, timestamp. |
| Browser Type | Player joins or room creation begins. | Browser family, major version, desktop indicator, supported/unsupported status, timestamp. |
| Failure Reasons | Any user-facing failure state is shown. | Flow area, failure reason, recoverable/non-recoverable flag, timestamp. |

## 7. Target Audience & Personas

### Remote Social Groups (Ages 18-35) - Primary

Goals:

- Start a shared activity during remote hangouts without setup.
- Use personal photos, memes, or shared memories as puzzle material.
- Collaborate synchronously while communicating through external tools.

Pain Points:

- Multiplayer games often require downloads, accounts, or setup.
- Screen-sharing gives only one person control.
- Pre-made puzzle libraries feel less personal.

Motivations:

- Low-commitment fun during video calls or group chats.
- Shared accomplishment and light competition through solve time.
- A sense of casual presence while physically apart.

Typical Usage Scenarios:

- A spontaneous hangout where a group on a call starts a puzzle during a lull.
- A planned event where a room code is shared ahead of a scheduled call.
- A background activity during a long call where players drift in and out.

### Casual Office Teams / Ice-Breaker Groups - Secondary

Goals:

- Run a 10-15 minute remote team-building activity.
- Avoid account creation, installation, and IT approval.
- Give all participants a way to contribute at the same time.

Pain Points:

- Team activities often require setup or specialized tools.
- Competitive games can feel exclusionary.
- Work groups may use the product sporadically rather than habitually.

Motivations:

- Simple, synchronous group participation.
- Low-stakes collaboration with a clear finish state.
- Fast access through room code and display name only.

Typical Usage Scenarios:

- A planned team ice-breaker using a shared code during a remote meeting.
- A short collaborative puzzle session using an uploaded team-relevant image.

### Family Groups - Secondary

Goals:

- Solve puzzles together remotely using personal photos.
- Enable less tech-savvy participants to join with minimal steps.
- Maintain the session if someone disconnects or joins later.

Pain Points:

- Account creation and app installation create barriers.
- Some users may be less comfortable with complex interfaces.
- Family schedules may require participants to join at different times.

Motivations:

- Shared memories through vacations, celebrations, and family photos.
- Simple, familiar puzzle mechanics.
- 24-hour room availability for breaks and staggered participation.

Typical Usage Scenarios:

- A family call where one person uploads a photo and shares the code.
- A puzzle room left open for an hour while people enter and exit.

## 8. User Stories

### Room Creation

- As a player, I want to upload a photo from my device so that my friends and I can solve a puzzle made from a personal image.
- As a room creator, I want the product to validate my image before processing so that I know immediately when the file cannot be used.
- As a room creator, I want to choose a supported grid size from 4x4 through 10x10 so that I can control puzzle difficulty and session duration.
- As a room creator, I want the system to generate interlocking puzzle pieces from the selected image and grid so that the puzzle feels like a real jigsaw.
- As a room creator, I want to receive a short, easy-to-share room code so that I can invite friends without sending a long URL.
- As a room creator, I want to enter a display name so that other players can identify me in the room.
- As a room creator, I want to enter gameplay immediately after room creation so that the session starts without a separate lobby.

### Joining

- As a player, I want to join a room by entering a code and display name so that I can participate without creating an account.
- As a player, I want room code entry to be case-insensitive so that codes are easier to communicate verbally or in text.
- As a player, I want to see a clear message when a room code is invalid, expired, or full so that I understand why I cannot join.
- As a player, I want to see the current puzzle state immediately upon joining so that I can contribute even if the group has already started.
- As a player, I want duplicate display names to be allowed so that I am not blocked by another player using the same name.

### Gameplay

- As a player, I want to click a piece to claim it so that I can move it without conflicting with other players.
- As a player, I want lock acquisition to be server-authoritative so that two players cannot move the same piece at the same time.
- As a player, I want to see which pieces are currently held by other players so that I can choose different pieces to work on.
- As a player, I want the puzzle board, piece pool, timer, room code, and player indicators visible in one desktop workspace so that I can understand the session without switching views.
- As a player, I want unplaced pieces to stay visible and reachable so that no puzzle piece becomes lost outside the workspace.
- As a player, I want to drag a claimed piece smoothly across the board so that placing it feels natural and responsive.
- As a player, I want other players' piece movements to update in real time so that the board feels shared.
- As a player, I want pieces to snap into place when released near the correct location so that precise alignment is not frustrating.
- As a player, I want incorrectly placed pieces to remain movable and unpenalized so that mistakes are easy to correct.
- As a player, I want placed pieces to become immovable so that completed progress cannot be disrupted.
- As a player, I want to see the puzzle timer so that the group can track how long it has been solving.

### Completion And Persistence

- As a player, I want the puzzle to clearly indicate completion so that the group knows it has finished.
- As a player, I want to see the total solve time so that the group can recognize its shared accomplishment.
- As a player, I want the product to persist my anonymous session so that reconnecting after a network issue or browser refresh restores my locks within the grace period without requiring an account.
- As a player, I want to receive the full current room state after reconnecting so that my board is accurate.
- As a player, I want clear warnings before refreshing, closing, or navigating away from an active room so that I understand how disconnect and lock-release rules apply.
- As a room creator, I want the room to remain available for 24 hours regardless of who is connected so that friends can rejoin within that window.
- As a player, I want expired rooms to be unavailable so that the product's ephemeral data policy is predictable.

## 9. User Journey

### Primary Lifecycle

1. Landing Page
   - The user arrives in a desktop browser.
   - The user chooses to create a room or join an existing room.

2. Image Upload
   - The creator selects a local raster image.
   - The system validates file type, size, and integrity.
   - If validation fails, the creator receives a specific error and can retry.

3. Grid Selection
   - The creator selects one supported integer grid size from 4x4 through 10x10.
   - The system does not offer custom or irregular grid sizes.

4. Puzzle Generation
   - The system splits the uploaded image into pieces according to the selected grid.
   - Pieces have deterministic unique interlocking edges.
   - Edge pieces have straight outer edges.
   - Pieces are presented in correct orientation; rotation is not available.

5. Display Name Entry And Room Creation
   - The creator enters a display name before submitting room creation.
   - The system creates a room with an 8-character case-insensitive alphanumeric code after successful puzzle generation.
   - The code is unique among active rooms.
   - The room starts its 24-hour lifecycle at creation.
   - The system admits the creator as the first player and issues a persisted anonymous `sessionId`.
   - No account, password, email, OAuth, or persistent identity is requested.

6. Invite Friends
   - The product displays the room code.
   - The creator communicates the code through external channels.
   - The product does not provide in-app chat, voice, video, friend lists, or invite systems beyond the room code.

7. Join
   - Friends enter the room code and display name.
   - The system validates code existence, expiration, and capacity.
   - Accepted players receive the current board state.

8. Gameplay
   - The board is centered in the desktop workspace and scaled to the processed image aspect ratio.
   - Unplaced pieces appear in the visible piece pool around or adjacent to the board.
   - A player claims an unclaimed piece.
   - The server grants an exclusive lock if available.
   - The player drags the piece.
   - Movement is synchronized to all room members.
   - On release, the server validates snap proximity.
   - Correct pieces snap exactly into place and become immovable.
   - Incorrect releases remain at the released coordinates, unlock, and stay available.

9. Completion
    - The server declares completion when every piece is placed.
    - The timer stops.
    - All connected players see the completed puzzle and solve time.
    - Pieces can no longer be moved.

10. 24-Hour Persistence
    - Room state persists for 24 hours from creation.
    - Players can disconnect and rejoin during the window.
    - The creator has no special ongoing privileges.

11. Expiration
    - At exactly 24 hours from creation, the room is permanently deleted.
    - Connected players are notified and removed.
    - The room code may be reused after deletion.

### Decision Points And Error Branches

- Invalid image: reject before processing and allow retry.
- Oversized image: reject with the 10 MB limit and allow retry.
- Corrupted image during splitting: show processing error and allow re-upload.
- Upload interruption: discard partial upload and allow retry.
- Upload cancellation: return to upload state without creating a room.
- Unsupported browser or viewport: show a non-gameplay state before room creation or direct piece interaction.
- Server or storage unavailable: show recoverable error and avoid duplicate room creation.
- Invalid code: reject join and show invalid code error.
- Expired room: reject join and show expired room error.
- Full room: reject join once 6 players are present.
- Join timeout: return to join state with retry.
- Duplicate display name: allow join; the system may add subtle disambiguation if needed.
- Disconnect during gameplay: retain locks for 60 seconds.
- Reconnect within grace period: restore full state and locks.
- Reconnect after grace period: restore full state but previously held locks have been released.
- Puzzle completed during disconnect: returning player sees completed puzzle and solve time.
- Room expiration during drag: stop movement immediately, delete the room, notify the player, and return them to entry.
- Browser refresh, tab close, or navigation away: show a browser-supported warning when possible, then apply disconnect and reconnect rules.

## 10. Functional Requirements

Priority mapping: P0 = Must Have, P1 = Should Have, P2 = Could Have.

### 10.1 Image Upload & Validation

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Image upload | The creator shall upload a local image from their device as the puzzle source. | P0 | Enables personal-content puzzles. | A creator can select one image file and submit it for validation; no room is created until upload, validation, and generation complete; no pre-made puzzle library is required or shown. | Upload failure due to network interruption discards partial data, shows a retry path, and records Upload Failed with failure reason. |
| Supported formats | The system shall accept JPEG, PNG, WebP, and GIF raster images only. | P0 | Ensures predictable browser display and processing. | JPEG, PNG, WebP, and GIF files with valid MIME type and decodable image data are accepted; SVG, PDF, HEIC, AVIF, video, archive, executable, and non-image files are rejected before processing. | Files with mismatched extension and MIME type are rejected; malicious filenames are ignored for display and storage naming. |
| Size limit | The system shall reject files larger than 10 MB. | P0 | Prevents slow generation and abuse. | A file whose uploaded byte size exceeds 10 MB is rejected before puzzle generation; the error message states the 10 MB limit; no room or partial puzzle is created. | Oversized files are rejected even when image dimensions are otherwise valid. |
| Resolution limits | The system shall require source images to be at least 800 px on their shortest side and no more than 6000 px on either side after metadata orientation is applied. | P0 | Ensures pieces remain legible while preventing oversized processing loads. | Images below the minimum are rejected with a resolution error; images above the maximum are automatically downscaled for processing while preserving aspect ratio; generated puzzle state uses the processed dimensions consistently for all players. | Oversized dimensions, image bombs, and images whose decoded pixel count exceeds safe processing limits are rejected before splitting. |
| Aspect ratio handling | The system shall preserve the uploaded image aspect ratio and fit the puzzle board to that ratio. | P0 | Avoids distorting personal images. | Generated pieces align to a board with the same normalized aspect ratio as the processed image; no crop, rotate, stretch, filter, or user editing tool is provided; supported aspect ratio values are strictly bounded between 1:2 (0.5) and 2:1 (2.0). | Images with aspect ratios outside 0.5 to 2.0 are rejected during validation with a specific aspect-ratio error message. |
| Metadata handling | The system shall remove EXIF and other embedded metadata before puzzle generation and room retention. | P0 | Protects privacy while keeping the uploaded image usable. | Location, device, author, timestamp, and other metadata are not retained in room state; EXIF orientation may be applied before stripping so the image displays correctly. | Corrupted metadata does not block a valid decodable image unless it prevents safe decoding. |
| Color and transparency handling | The system shall normalize supported images for consistent web display. | P0 | Prevents inconsistent piece appearance across browsers. | Unsupported color spaces are converted to a standard display color profile when safe; images that cannot be safely converted are rejected; transparent pixels render against a neutral board-safe background. | Animated GIFs use the first decodable frame only; animation is not preserved in pieces. |
| Integrity validation | The system shall verify that the uploaded file is a valid, processable image. | P0 | Prevents broken puzzles and unclear failure states. | Corrupted images, invalid image headers, truncated files, malformed raster data, and files that fail decoding are rejected with a clear error; the creator can re-upload without penalty. | Corrupted files that pass initial validation but fail during splitting trigger a processing error and retry path. |
| Timeout and cancellation handling | The upload and generation flow shall recover from cancellation and timeout. | P0 | Keeps creation failures understandable and reversible. | User-cancelled upload returns the creator to the upload state without an error; upload timeout before completion shows retry; generation timeout at 5 seconds shows a processing failure and no room is created. | Server unavailable or storage unavailable during upload or generation shows a recoverable error and discards incomplete state. |
| Processing failure handling | If server-side processing fails, the system shall notify the creator and allow re-upload. | P0 | Keeps failure recoverable. | Processing failure does not create a partially usable room; retry is available; duplicate retry submissions from the same creation attempt do not create multiple rooms; upon upload or generation failure, the creation form retains the creator's previously selected grid size and display name while resetting only the file upload input to allow immediate re-upload. | Server failure during processing does not retain partial puzzle state. |

### 10.2 Puzzle Generation

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Grid selection | The creator shall select a discrete square grid size from 4x4 through 10x10 before generation. | P0 | Lets the creator control difficulty and duration. | Only integer grid options from 4x4 to 10x10 are available. | Custom, irregular, or non-integer grid sizes are not available. |
| Grid splitting | The system shall split the image into exactly one piece per selected grid cell. | P0 | Produces predictable puzzle size. | A 4x4 grid creates 16 pieces; a 10x10 grid creates 100 pieces; intermediate square grids follow the same rule. | Generation failure shows an error and allows re-upload. |
| Unique piece edges | Pieces shall have visually distinct interlocking tabs and blanks. | P0 | Makes the puzzle feel authentic and satisfying. | Generated pieces visually interlock; adjacent piece edges correspond to the grid. | Edge-piece rules still apply on puzzle perimeter. |
| Deterministic generation | Piece shapes shall be deterministic from the image and grid dimensions. | P0 | Ensures consistent puzzle structure for all room participants. | The same image and grid size produce the same piece shapes. | Clients do not alter puzzle structure. |
| Edge-piece handling | Pieces on the puzzle perimeter shall have straight outer edges. | P0 | Preserves jigsaw expectations. | Top, bottom, left, and right perimeter edges render as straight outside edges. | Corner pieces have two straight outer edges. |
| No rotation | Pieces shall be presented in their correct orientation and moved only by translation. | P0 | Keeps MVP accessible and avoids extra controls. | No rotation controls or rotation states exist; all placement validation assumes correct orientation. | Rotation is not available through mouse, keyboard, menu, or shortcut. |

### 10.3 Room Management

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Room creation | The system shall create a room after successful puzzle generation. | P0 | Starts the collaborative session. | A room is created only after image validation and puzzle generation succeed. | Failed generation creates no room. |
| Auto-generated codes | Each room shall receive a system-generated 8-character alphanumeric code using the case-insensitive character set `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. | P0 | Provides ~853 billion combinations for non-guessable room code entropy. | Users cannot choose room codes; codes are displayed after room creation; generated codes are 8 characters and exclude `0`, `1`, `I`, `L`, and `O`. | Code generation collision triggers automatic internal regeneration. |
| Case-insensitive codes | Room code entry shall be case-insensitive. | P0 | Reduces entry errors. | Entering the same code in different letter casing resolves to the same active room; input may be normalized by trimming spaces and converting to uppercase before validation. | Ambiguous excluded characters are never generated, and user-entered excluded characters are treated as invalid input. |
| Active-room uniqueness | Codes shall be unique among active, non-expired rooms. | P0 | Prevents users from joining the wrong room. | No two active rooms share the same code. | Duplicate generated code is regenerated until unique. |
| 24-hour TTL | Each room shall expire exactly 24 hours after creation, unless early cleanup applies to unjoined empty rooms. | P0 | Supports ephemeral sessions and privacy. | Room remains recoverable before TTL and is unavailable after TTL; rooms with 0 active participants for >15 consecutive minutes after creation shall automatically expire early and trigger resource cleanup. | All connected users are notified and removed at expiration. |
| Creator-agnostic survival | The room shall continue if the creator disconnects. | P0 | Prevents a host disconnect from ending play. | Other players can continue playing after creator disconnects. | There is no host migration because the room has no host role after creation. |
| Room deletion | Expired rooms and associated data shall be permanently deleted. | P0 | Enforces privacy and data minimization. | After TTL, room state, image data, player list, timer, locks, and placements are unrecoverable. | Expired room code may become available for reuse. |

### 10.4 Anonymous Entry

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Session persistence | The client shall persist the anonymous `sessionId` locally after join or room creation so reconnect can restore session continuity. | P0 | Enables lock recovery without accounts. | The client must persist the anonymous session identifier using a browser storage mechanism; the exact storage API and security attributes are defined in the TRD. | Clearing browser storage requires rejoin as a new session; display name may be prefilled but identity is not restored without `sessionId`. |
| Join by code and name | A player shall join by entering only a room code and display name. | P0 | Removes onboarding friction. | No account, password, email, OAuth, profile, or persistent identity is requested. | Missing or invalid room code prevents join with a clear error. |
| No PII collection | The system shall not collect or store personally identifiable information. | P0 | Protects privacy and supports anonymous access. | Required gameplay inputs are limited to room code and display name. | Display names are ephemeral and deleted with the room. |
| Display name validation & sanitization | Display names shall be validated and sanitized before rendering. | P0 | Prevents injection or rendering attacks and ensures input compliance. | Maximum length: 30 characters. Allowed characters: Unicode letters, numbers, spaces, hyphens, and underscores. Sanitization: HTML-escape before rendering; strip leading/trailing whitespace; collapse multiple spaces; reject null bytes and control characters. | No profanity filtering or name reservation is performed. |
| Duplicate names | Duplicate display names shall be allowed within a room. | P0 | Avoids unnecessary join friction. | A player can join even when another active or disconnected player has the same display name; duplicate names receive session-local sequential numeric disambiguation suffixes (e.g. `Sam (2)`, `Sam (3)`) in ownership indicators and player lists. Disambiguation uses a room-scoped monotonic counter per display name that is never recycled or reassigned when a player leaves or disconnects. | Disambiguation suffix is assigned server-side sequentially upon join using a monotonic per-name counter (e.g., if "Sam (2)" leaves and a new "Sam" joins, the new player receives "Sam (3)"), remains immutable for the duration of the session, and does not create a profile or persistent identity. |
| Room capacity | A room shall support a maximum of 6 players and a minimum of 1 player after creation. | P0 | Keeps board density and contention manageable. | The creator enters as player 1; join attempts after 6 players are rejected; player sessions currently in `grace` status (disconnected <60 seconds) do not count toward the 6-player active capacity limit. | Grace sessions do not count toward the 6-player active capacity limit. If a 7th player joins while 6 players are active and 1 is in grace, the oldest grace session is evicted and its locks are released. |
| Rejection reasons | Join failures shall distinguish invalid, full, and expired rooms. | P0 | Helps users understand the next action. | Invalid, full, and expired outcomes show clear, specific messages. | Expired rooms cannot be recovered or extended. |

### 10.5 Piece Ownership & Locking

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Exclusive locks | A piece shall be locked by exactly one player at a time. | P0 | Prevents conflicting movement. | Once locked, the piece cannot be claimed by another player until released. | Simultaneous lock requests result in exactly one success and one rejection. |
| Atomic claim & Wait-for-Lock | Lock acquisition shall be atomic and server-authoritative. | P0 | Ensures reliable conflict resolution and authoritative multiplayer state. | Clients must wait for the server to grant the lock via piece_locked before initiating local drag. Lock acquisition should feel instantaneous under normal network conditions. | Rejected claim triggers immediate lock rejection feedback and piece remains in place. |
| Ownership indicators | Locked pieces shall be visually associated with the owning player. | P0 | Shows who is working on which piece. | All players can distinguish locked pieces from unclaimed pieces. | Duplicate display names remain acceptable; disambiguation may be used if needed. |
| Lock release on drop | A lock shall release when the owner drops a piece unless the piece is snapped into place. | P0 | Keeps pieces available after attempts. | Releasing outside snap threshold unlocks the piece. | Incorrect placement has no score, time penalty, or error marker. |
| Lock retention on disconnect | If a player disconnects while holding pieces, locks shall remain for 60 seconds. | P0 | Allows recovery from short interruptions. | Reconnect within 60 seconds restores locks; failure to reconnect releases locks. | Browser refresh is treated as disconnect followed by reconnect. |
| AFK lock release | If a locked piece undergoes no positional movement for 90 seconds while held by a connected player, the server shall automatically release the lock. | P0 | Prevents griefing and unblocks active players. | Held pieces with zero movement for 90 seconds transition back to unclaimed status and broadcast piece_released; when a lock is released due to AFK inactivity, the system must send a distinct, user-facing notification to the affected player (e.g., 'Your piece was released after 90 seconds of inactivity'). This notification must be distinguishable from a standard manual release or disconnect grace release. | Re-claiming the piece is permitted after movement resumes. |

### 10.6 Real-Time Synchronization

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Server authority | The server shall be the sole authority for piece positions, locks, placement status, timer, room capacity, expiration, and completion. | P0 | Ensures all players share the same truth. | Clients render server-approved state for all committed puzzle changes; clients do not finalize lock, snap, placement, completion, or timer state independently; state divergence incidents target is 0. | Actions from stale, disconnected, expired, or duplicate sessions are rejected without corrupting room state. |
| Client intent model | Clients shall send player intent for claim, move, release, reconnect, and leave actions. | P0 | Enables validation before shared state changes. | Invalid, duplicate, out-of-order, or no-longer-applicable actions are rejected or ignored idempotently; accepted actions produce exactly one authoritative state transition. | Repeated release or claim messages caused by network retry do not duplicate analytics, locks, placements, or completion events. |
| Movement update frequency | During active drag, the local client shall send movement intent frequently enough to support smooth remote rendering, targeting 20 updates per second and allowing throttling under constrained network conditions. | P0 | Keeps multiplayer motion legible without requiring frame-perfect transport. | Under normal broadband, other clients receive position updates with median end-to-end latency under 100ms; update frequency never causes the server to accept invalid lock ownership or placement state. | Above 300ms RTT, movement may be less fluid but must remain functional and eventually consistent. |
| Position broadcast | Valid piece position updates shall be broadcast to all active room members except where suppression is needed to avoid echoing redundant local state. | P0 | Creates the visible shared board experience. | Other players see moving pieces during dragging; each broadcast contains enough state for clients to render the piece at the authoritative position with the correct owner and z-order. | Brief interruptions under 5 seconds should be invisible where synchronization resumes. |
| Client interpolation | Clients shall smooth remote piece movement between authoritative positions without changing final server-approved coordinates. | P1 | Improves perceived responsiveness while preserving correctness. | Remote dragged pieces move continuously between received positions; snap and placed states always resolve to exact server coordinates. | Interpolation stops immediately when a piece is snapped, released, locked by another player, or the room completes. |
| Full state on join | Joining and reconnecting players shall receive the full current room state before gameplay becomes interactive. | P0 | Lets players enter active sessions accurately. | Player sees current piece positions, locks, placements, player list, timer, board scale, puzzle completion state, and room expiration state before claiming a piece. | Incremental patches are not sufficient after extended disconnect, browser refresh, tab suspension, or duplicate reconnect. |
| Conflict resolution | Simultaneous conflicting actions shall resolve through server-authoritative state. | P0 | Prevents undefined multiplayer behavior. | For same-piece claims, one player receives the lock and all others are rejected within one server decision; rejected clients receive visible feedback and cannot move the piece. | A claim that arrives after a piece has snapped or after completion is rejected. |
| Network interruption handling | Extended interruptions shall show a reconnecting state and retry path. | P1 | Prevents silent failure. | Reconnect attempts begin immediately after connection loss, retry at 1s, 2s, 4s, 8s, and 15s intervals, and stop after 30 seconds or room expiration; failure returns the player to the join screen with retry. | Player actions during interruption are buffered only while ownership is still plausible and are discarded if full-state recovery contradicts them. |

### 10.7 Snap-to-Fit & Placement

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Server-side proximity validation | On release, the server shall calculate distance between the piece center and correct grid position center. | P0 | Makes placement authoritative and consistent. | Snap decisions are made only by the server. | Clients do not perform optimistic snap validation. |
| Snap threshold | A piece shall snap if released within 25% of the shorter side of the piece's bounding box, measured from piece center to correct grid-position center. | P0 | Forgives minor alignment inaccuracies. | Release at or inside the threshold snaps to exact correct position; release outside the threshold does not snap; the same threshold rule applies across grid sizes. | Threshold tuning may be revisited post-launch only if Snap Accuracy misses the > 60% target. |
| Exact placement | Snapped pieces shall move to their exact correct grid location. | P0 | Produces a clean completed puzzle. | Snapped piece aligns precisely to target cell. | Piece remains placed even if neighbors are not placed. |
| Placed visual distinction | Placed pieces shall be visually distinct from unplaced pieces. | P0 | Communicates completed progress. | Players can identify pieces that are no longer selectable. | Visual treatment must not imply cosmetic customization. |
| Placed immobility | Once placed, a piece shall become immovable by any player. | P0 | Protects completed progress. | Placed pieces cannot be claimed, dragged, or released. | Completion is irreversible. |
| No adjacency validation | The system shall validate only proximity to the correct grid location. | P0 | Keeps placement simple and predictable. | A piece can snap when its neighbors are absent. | No piece-to-piece adjacency checks are performed. |
| Incorrect release behavior | A piece released outside threshold shall remain at released coordinates and become unclaimed. | P0 | Makes mistakes recoverable. | The piece is immediately available for any player to claim. | No scoring penalty, time penalty, or incorrect-placement marker appears. |

### 10.8 Completion Detection

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Placed-piece counter | The server shall track the number of placed pieces. | P0 | Enables reliable completion detection. | Counter increments when a piece snaps and equals total pieces at completion. | Counter cannot exceed total piece count. |
| Completion trigger | The puzzle shall be complete when every piece is placed. | P0 | Provides a clear finish condition. | Completion fires once when placed count equals total count. | Completion is irreversible. |
| Timer start and stop | The solve timer shall start at the first successful piece claim (`piece_locked` event) and stop at completion. | P0 | Gives the group a measurable outcome. | The solve timer shall start at the first successful piece claim (`piece_locked` event) and stop at completion. Final solve time is based on authoritative server time (`solveTime = completedAt - firstClaimedAt`). | Client clocks are not trusted. |
| Completion broadcast | Completion shall be broadcast to all connected players. | P0 | Lets the group finish together. | Connected players see completed image and solve time simultaneously. | Disconnected players see final state on reconnect. |
| Post-completion immobility & Clean View | After completion, no further piece movement shall be possible, and a Clean View toggle shall allow hiding piece grid lines. | P0 | Preserves finished result and allows viewing the unmarred photo. | Claims, drags, and releases are unavailable after completion; the completion overlay includes a "Toggle Grid Lines" / "Clean View" control to display the uninterrupted image. | Room still expires 24 hours after creation. |

### 10.9 Disconnect, Reconnect & Grace Period

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Grace period | A disconnected player's locks shall be retained for 60 seconds. | P0 | Protects work during short interruptions. | Reconnect within 60 seconds restores held locks; after 60 seconds, all locks held by the disconnected session are released and broadcast to active players. Silent connection drops are detected automatically by the real-time transport layer; the exact mechanism is specified in the TRD. | If room expiration occurs during the grace period, expiration wins and the room is deleted. |
| Network proxy & firewall detection | The client shall detect when real-time network transport is blocked by enterprise firewalls or proxies and inform the user. | P0 | Prevents confusion when corporate network security blocks gameplay connections. | When real-time connection establishment fails due to network proxy or firewall blocking, the UI presents a persistent warning banner stating "WebSocket connection blocked by network firewall/proxy. Retrying connection..." while background retries continue. | Banner clears automatically if network transport succeeds. |
| Protocol versioning | The real-time communication protocol shall enforce explicit schema versioning. | P0 | Prevents client errors during rolling server deployments. | The real-time protocol must enforce explicit schema versioning to prevent client errors during rolling deployments; version semantics are defined in the TRD. | Version mismatch during deployment prompts client reload. |
| Full state refresh | Reconnected players shall receive the full current room state before interactions are re-enabled. | P0 | Prevents stale board views. | Reconnected board shows current positions, locks, placements, player list, timer, completion state, and expiration status before the player can claim or move pieces. | Extended disconnects, tab suspension, browser refresh, and duplicate reconnect do not rely only on incremental updates. |
| Reconnect identity match | Reconnect shall use the same room code and the persisted sessionId. | P0 | Preserves anonymous session continuity. | Reconnect shall use the same room code and the persisted sessionId. Display name is not used for identity matching. | Original display name is preserved unless the player explicitly changes it before rejoining. |
| Browser refresh | Browser refresh shall be treated as disconnect followed by immediate reconnect and must warn if active gameplay may be interrupted. | P0 | Makes refresh survivable. | Refresh completing within grace period resumes seamlessly after full-state refresh; refresh warning appears when the browser supports navigation warnings and the player is connected to an active room. | Longer refresh releases locks but room state remains until TTL. |
| Failed reconnect | If reconnection fails after repeated attempts, the player shall return to join with retry option. | P1 | Provides a clear recovery path. | Reconnect attempts occur at 1s, 2s, 4s, 8s, and 15s intervals; after 5 failed attempts or 30 seconds, the player is returned to join with the room code prefilled when available. | Existing room remains available until TTL if not expired; retrying before 60 seconds may still restore locks. |
| Creator disconnect | The creator shall have no special runtime privilege after room creation. | P0 | Keeps rooms independent of any host. | Room continues after creator disconnects. | Any joined player can continue playing. |
| All players disconnect | If all players disconnect, room state shall persist until expiration. | P0 | Allows later return within 24 hours. | Rejoining before TTL restores current room state. | Room is still deleted at 24 hours. |

### 10.10 Room Persistence & Cleanup

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| 24-hour state retention | Full room state shall be retained for 24 hours from creation. | P0 | Allows breaks, reconnection, and asynchronous participation within a bounded window. | Piece positions, locks, placements, player list, timer, and completion state are recoverable before expiration. | Room state is retained even if all players disconnect. |
| Creator-agnostic persistence | Room survival shall not depend on creator presence. | P0 | Prevents session loss. | Creator disconnect does not delete or pause the room. | No host migration flow exists. |
| Expiration notification | Connected players shall be notified when the room expires. | P0 | Makes deletion understandable. | At expiration, connected players are removed and told the room expired. | Further joins are rejected as expired or invalid according to deletion timing. |
| Expiring-soon warning | Connected players should receive a best-effort warning before expiration. | P1 | Gives groups time to finish or save a screenshot externally. | At 23 hours 30 minutes after creation, connected clients receive a non-blocking expiring-soon notice; missing the notice does not extend TTL. | Warning is best-effort and may be missed during disconnect. |
| Permanent deletion | After 24 hours, all room data shall be permanently and irreversibly deleted. | P0 | Enforces privacy and temporary-room promise. | Room cannot be restored, extended, archived, or saved. | Room code may become available for reuse. |

### 10.11 Gameplay Workspace, Board, Piece Pool & Viewport

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Workspace layout | The gameplay screen shall contain one shared workspace with the puzzle board, scattered piece pool, room code, timer, and player indicators visible on desktop. | P0 | Gives players a single place to understand and act on the puzzle. | On supported desktop viewports, the board, active unplaced pieces, timer, room code, and player indicators are visible without opening a secondary page or lobby. | If the viewport is below the minimum supported desktop size, the product shows an unsupported viewport message rather than enabling a broken mobile layout. |
| Board positioning | The puzzle board shall be positioned as the primary visual anchor in the workspace. | P0 | Makes the target assembly area obvious. | On initial load, the board is centered within the available gameplay area after reserving fixed UI space for room code, timer, and player indicators; at least 24 px of empty margin exists around the board frame on supported desktop viewports. | Browser resize recalculates board scale and position without changing authoritative piece coordinates. |
| Board dimensions | The board shall scale to the uploaded image aspect ratio while respecting desktop viewport limits. | P0 | Preserves the uploaded image without distortion. | The board uses the processed image aspect ratio; maximum visible puzzle size is 70% of workspace width and 78% of height for 4x4 through 8x8 grids, and is capped at 55% workspace width for 9x9 and 10x10 grids to ensure adequate surrounding piece pool area; minimum visible board size is 480 px on its shorter side when viewport allows. | Images whose aspect ratio would make the playable board smaller than the minimum supported size are rejected during upload with a specific aspect-ratio error. |
| Puzzle frame | The board shall include a visible frame that indicates the exact target boundary. | P0 | Helps players place pieces accurately. | The frame is visible before any pieces are placed, remains visible during play, and does not cover piece image content after snapping. | The frame remains visible when the board is partially complete and when no pieces are placed. |
| Empty board state | A new room shall start with the board empty and all pieces unplaced in the piece pool. | P0 | Makes the starting state clear. | Placed-piece count is 0; every piece is unplaced, unlocked, and rendered outside the board target cells unless the scatter bounds require minimal safe overlap with the board margin. | No piece starts in a snapped or placed state. |
| Initial piece distribution | The system shall scatter unplaced pieces around the board in the shared piece pool area. | P0 | Creates a recognizable jigsaw-starting experience. | At room creation, at least 90% of pieces have centers outside the puzzle frame; pieces appear within visible workspace bounds; distribution is deterministic per room so all players see the same initial layout. | For dense 10x10 puzzles, controlled overlap is allowed to keep pieces visible. |
| Scatter rules | Initial scatter shall randomize piece positions and z-order while keeping pieces reachable. | P0 | Prevents repetitive layouts and preserves usability. | Piece centers spawn inside defined workspace bounds; no piece center spawns outside the visible workspace; no piece may spawn fully hidden behind fixed UI; z-order is randomized at generation. | If a generated scatter position violates bounds, it is retried until valid or placed in the nearest available pool area. |
| Piece overlap | Unplaced pieces may overlap in the pool, but overlap shall be limited. | P0 | Allows dense puzzles without making pieces impossible to select. | At least 65% of each piece's bounding box remains visible at initial scatter for 4x4 through 8x8 grids; at least 50% remains visible for 9x9 and 10x10 grids. | A selected or claimed piece rises above overlapping unplaced pieces. |
| Piece spacing | Initial scatter shall avoid placing all pieces into a single stack or line. | P0 | Makes the board immediately playable. | No more than 10% of total pieces may share substantially the same center region; pieces are distributed across available left, right, top, and bottom pool zones where viewport space allows. | Small desktop viewports may use fewer pool zones, but pieces remain selectable. |
| Distance from board | Unplaced pieces shall spawn outside the board frame with a minimum 16 px gap where workspace dimensions allow. | P0 | Separates the target area from the pool. | On standard desktop viewports, initial unplaced piece centers sit outside the puzzle frame and do not cover the frame boundary. | Dense layouts may allow partial visual overlap with board margins, but pieces do not start snapped or placed. |
| Drag boundaries | Players shall not be able to move pieces entirely outside the visible workspace. | P0 | Prevents lost pieces. | During drag and release, at least 40% of the piece bounding box remains within visible workspace bounds; server-corrected positions enforce this on release. | Browser resize that would push a piece outside bounds repositions only the rendered viewport mapping, not the piece's authoritative logical location. |
| Z-order behavior | The active dragged piece shall render above all unplaced and placed pieces. | P0 | Keeps the controlled piece visible. | Claiming or dragging a piece brings it to top of movable-piece z-order; placed pieces remain visually integrated with the board and do not obscure active dragged pieces. | Simultaneous drags by multiple players preserve deterministic z-order based on server-authoritative claim sequence. |
| Board scaling on resize | Browser resize shall preserve gameplay state while recalculating visual scale. | P0 | Prevents disruption during normal desktop resizing. | Piece logical positions remain stable relative to workspace coordinates; board and pieces rescale together; locks, placed states, timer, and player list are unchanged. | If resize drops below minimum supported desktop viewport, interaction is paused and an unsupported viewport message is shown. |
| Viewport support | The MVP shall support desktop viewports at or above 1024 x 700 CSS pixels. | P0 | Defines the desktop-first usability floor. | At 1024 x 700 and larger, the board, timer, room code, player indicators, and reachable pieces remain usable; below this size, a non-mobile unsupported viewport state appears. | Browser zoom reducing effective viewport below the minimum produces the same unsupported viewport state. |
| Zoom and pan | In-app zoom and pan are not supported in the MVP. | P0 | Keeps the workspace simple and consistent for all players. | No in-app zoom controls, pan mode, minimap, camera controls, or reset-view control are present. | Browser zoom remains a browser-level behavior; the app responds to the resulting viewport size but does not synchronize zoom across players. |
| Scroll and trackpad behavior | Scroll wheel and trackpad gestures shall not move an in-app camera. | P0 | Prevents accidental workspace drift. | Scrolling over the game workspace does not pan the board; trackpad pinch is treated only as browser zoom if the browser performs it. | Page-level scrolling is avoided during active gameplay on supported desktop viewports. |

### 10.12 Security & Abuse Protection

| Requirement | Description | Priority | User Value | Acceptance Criteria | Edge Cases |
|---|---|---|---|---|---|
| Upload rate limiting | The system shall limit repeated upload attempts (max 5 per minute per client context) from the same anonymous client context. | P0 | Reduces abuse without requiring login. | Excessive upload attempts are temporarily rejected with a recoverable rate-limit message; legitimate retry after failure remains possible within defined limits. | Upload cancellation by the user does not count as a failed processing attempt. |
| Room creation rate limiting | The system shall limit repeated room creation attempts (max 3 per minute per client context) from the same anonymous client context. | P0 | Prevents duplicate room creation abuse. | Rapid duplicate submissions for the same completed generation create at most one room; excessive new room creation attempts show a temporary rate-limit message. | Browser refresh during creation does not create duplicate active rooms. |
| Join request rate limiting | The system shall limit repeated join attempts (max 10 per minute per client context for valid codes; max 10 per 5-minute window per client context for invalid codes, exceeding which triggers a 5-minute cooldown) from the same anonymous client context. Reconnect attempts follow the schedule in the Glossary (1s, 2s, 4s, 8s, 15s) and stop after 5 attempts or 30 seconds. Note: These values are MVP defaults and may be tuned post-launch. | P0 | Protects room codes from brute-force probing. | Repeated invalid code attempts are slowed or temporarily rejected; valid players can retry after the cooldown. | Case-insensitive input normalization occurs before rate-limit and validation decisions. |
| Room code brute-force protection | The system shall make room codes non-sequential, non-guessable, and resistant to repeated guessing. | P0 | Protects private rooms. | Codes are 8 characters, case-insensitive, unique among active rooms, and generated from an alphanumeric set excluding ambiguous characters; repeated invalid attempts trigger join rate limiting. | Code collision regenerates internally without exposing the collision to users. |
| Content safety screening | The system shall scan uploaded images for known illegal content before persisting assets. | P0 | Reduces legal and platform risk for user-generated uploads. | Automated content safety screening runs during upload validation; the specific technical method is defined in the TRD; flagged images are rejected with a generic upload failure message; no room is created from rejected uploads. | False positives return a recoverable upload failure; scanning does not create persistent identity or retain rejected image bytes beyond transient processing. |
| Upload validation | The system shall validate content type, file headers, decoded image dimensions, byte size, and safe processability before generation. | P0 | Prevents malformed or hostile files from becoming puzzle content. | Files failing any validation step are rejected with a clear user-facing reason where possible; no partial room is created. | Invalid MIME types, image bombs, oversized dimensions, corrupted metadata, and unsupported color spaces are rejected or safely normalized before processing. |
| Filename safety | User-provided filenames shall never be rendered or stored unsanitized. | P0 | Prevents injection and misleading UI. | Filenames containing scripts, path separators, control characters, or extremely long strings do not execute, break layout, or determine stored object names. | The product may omit filename display entirely. |
| Excessive reconnect protection | The system shall limit repeated reconnect attempts after the defined retry window. | P1 | Prevents runaway client behavior and protects room stability. | Reconnect retries stop after 30 seconds or 5 attempts, whichever occurs first; the player is returned to join with a retry option. | Duplicate reconnects for the same anonymous session resolve to one active session state. |
| Anonymous abuse boundaries | Abuse controls shall not require authentication, accounts, device fingerprinting presented to users, or persistent identity. | P0 | Preserves the anonymous MVP. | Rate limits operate without asking users to log in or verify identity. | Additional abuse-control mechanisms are post-MVP decisions and must preserve anonymous access. |

## 11. Non-Functional Requirements

### Performance

- Image upload and puzzle generation must complete within 5 seconds for supported file sizes under normal network conditions.
- Room creation must be instantaneous after image processing.
- Joining a room must take less than 2 seconds from code entry to rendered board as a performance requirement, while the product KPI target for average join time remains below 5 seconds.

### Responsiveness

- Perceived piece-update latency must be under 100ms on stable broadband connections.
- Lock acquisition must feel instantaneous; users must not experience a noticeable delay between clicking a piece and receiving control.
- Local drag feedback must begin immediately after the server grants the lock.
- Remote movement must be visually updated at a cadence that supports smooth tracking of another player's active drag under normal network conditions.

### Latency Tolerance

- Gameplay must remain functional up to 300ms round-trip latency.
- Above 300ms RTT, players must still be able to participate, though movement may feel less fluid.
- The experience must degrade gracefully rather than corrupting state or silently failing.
- At high latency, the system must prefer correctness over visual smoothness; server-approved placement, locks, and completion always override local prediction or interpolation.

### Networking

- Movement intent should target 20 updates per second during active drag under normal conditions.
- Broadcast updates must preserve server-authoritative ordering for lock, release, snap, placement, and completion state.
- Duplicate actions must be idempotent: repeated claim, release, snap, reconnect, or leave actions must not create duplicate state transitions.
- Clients may interpolate remote movement but must not use interpolation to alter final server-approved coordinates.
- Full-state recovery is required after join, reconnect, browser refresh, tab suspension, duplicate reconnect, and extended network interruption.
- Reconnect polling must begin immediately after connection loss and retry at 1s, 2s, 4s, 8s, and 15s intervals.
- Reconnect attempts must stop after 5 failed attempts or 30 seconds, whichever occurs first, and the player must receive a retry path.
- Brief network interruptions under 5 seconds should not interrupt visible gameplay if synchronization resumes successfully.
- Extended interruptions must show a reconnecting overlay and prevent the player from assuming unsynchronized local actions have been committed.

### Browser Support

- The MVP must support the latest two major versions of Chrome, Firefox, Safari, and Edge on desktop operating systems.
- Mobile browsers and touch-specific gestures are not MVP targets.

### Reliability

- Rooms must not lose state due to individual player disconnections.
- Room uptime must reach 99.9% within the 24-hour room window.
- Successful reconnect rate must exceed 95%.
- Transient failures must not corrupt room state.

### Persistence

- Full room state must be recoverable for 24 hours from creation.
- All room data must be permanently and irreversibly deleted after 24 hours.

### Scalability

- The system must support multiple concurrent rooms without performance degradation.
- Room-to-room isolation must be strict.
- State leakage between rooms is unacceptable and has a target of zero incidents.

### Security

- Uploaded images must be validated and sanitized before processing.
- Room codes must be non-sequential and non-guessable.
- Display names must be sanitized to prevent injection or rendering attacks.
- The product must collect and store zero personally identifiable information.
- Upload attempts, room creation attempts, join attempts, invalid room-code attempts, and reconnect attempts must be rate-limited without requiring accounts.
- Invalid MIME types, mismatched extensions, malicious filenames, corrupted metadata, oversized dimensions, unsupported color spaces, and image bombs must be rejected or safely normalized before processing.
- Rate-limit errors must be recoverable and must not reveal whether a guessed room code exists.
- Security controls must not introduce authentication, OAuth, social login, persistent profiles, friend lists, or identity verification into the MVP.

### Privacy

- No persistent identity exists.
- No player data, display name, image, room state, or timer data may be retained beyond the 24-hour room lifecycle.

## 12. UX & Design Requirements

### Design Principles

- The experience must be frictionless: no account creation, installation, login, or tutorial.
- The interface must be immediately comprehensible: pieces are scattered, the board is visible, and the goal is self-evident.
- The product must feel polished, responsive, and free of clutter.
- Every interaction must provide immediate visible feedback.
- The MVP is desktop-first and optimized for mouse and keyboard input.

### Gameplay UX Specification

Workspace layout:

- The gameplay screen must be a single desktop workspace, not a lobby or multi-page game flow.
- The puzzle board must be the primary visual anchor and must be centered within the available gameplay area after reserving space for persistent controls.
- The piece pool must surround or sit adjacent to the board within the same visible workspace.
- The layout must support desktop viewports at or above 1024 x 700 CSS pixels.
- Below 1024 x 700 effective viewport size, the product must show an unsupported viewport state and pause direct piece manipulation until the viewport is restored.

Puzzle board:

- The board must preserve the processed image aspect ratio.
- The board must fit within 70% of workspace width and 78% of workspace height for 4x4 through 8x8 grids.
- For 9x9 and 10x10 grids, maximum visible board width is capped at 55% of workspace width to preserve piece-pool area.
- The board must maintain at least 24 px of empty margin around the puzzle frame on supported desktop viewports.
- The puzzle frame must clearly indicate the exact target boundary before any pieces are placed.
- The frame must remain visible during play without covering image content after pieces snap.
- Board scaling must update on browser resize while preserving all logical piece positions, locks, and placements.

Piece tray/pool:

- The piece pool is the scattered area containing all unplaced pieces.
- At room creation, all pieces must begin unplaced, unlocked, and visible within workspace bounds.
- At least 90% of piece centers must spawn outside the puzzle frame on initial load.
- Pieces may overlap, but overlap must preserve selectable visible area according to the functional requirements.
- Pieces must never become fully unreachable or entirely outside the visible workspace.

Room code placement:

- The room code must be visible on the game board screen.
- The room code must remain readable while the player is dragging a piece.
- The room code must not imply account identity, friend list membership, or public discovery.

Timer placement:

- The timer must be visible during gameplay and must stop at completion.
- Timer display must be based on server-authoritative time.
- The timer must not obstruct piece interaction or the board frame.

Player indicators:

- The game board must show current joined players using display names only.
- Player indicators must not include avatars, profiles, accounts, or persistent identity.
- Duplicate display names may be subtly disambiguated with session-local suffixes or visual markers.

Ownership indicators:

- Claimed and locked pieces must display the owning player's display name or session-local visual marker.
- Ownership indicators must be visible to all players.
- Ownership indicators must not rely on color alone.
- Ownership labels must remain readable without obscuring the majority of the piece image.

Locked piece styling:

- Locked pieces must show a distinct border or outline, an ownership label, and elevated z-order.
- A locked piece owned by another player must not use an interactive cursor for non-owners.
- A locked piece owned by the local player must use a dragging or grabbing cursor during movement.

Placed piece styling:

- Placed pieces must align exactly to the board and become visually integrated with the completed image.
- Placed pieces must be visibly distinct from movable pieces through reduced shadow, disabled cursor, and lack of ownership label.
- Placed pieces must not be claimable, draggable, or selectable.

Visual Layer & Interaction Architecture:

- Piece selection must distinguish piece visual shapes from transparent bounding-box corners to prevent false selections. Rendering must maintain strict visual layering so the board, unplaced pool, and active dragged pieces are visually separated. The exact rendering architecture is defined in the TRD.

Completion overlay:

- Completion must show the completed image and final solve time.
- Completion must provide a Clean View toggle allowing players to hide or show piece grid lines on the completed image.
- Completion must clearly communicate that the puzzle is complete and movement is disabled.
- Completion must not generate share cards, result images, social media assets, achievements, rankings, or leaderboard entries.

Loading overlays:

- Upload processing, puzzle generation, room joining, full-state recovery, and reconnect must each present visible progress or waiting feedback.
- Loading states must block only the interactions that cannot be completed safely.
- Loading states must not imply that room persistence extends beyond 24 hours.

Error dialogs & Firewall Warning Banner:

- Error dialogs must state what failed and the available recovery action.
- When WebSocket upgrades fail due to network proxies or firewall blocks, the UI must present a persistent Firewall Warning Banner stating: "WebSocket connection blocked by network firewall/proxy. Retrying connection..."
- Errors must be shown as text and announced to assistive technology.
- Recoverable errors must return the user to the relevant retry point.
- Non-recoverable room errors, including expiration, must return the user to create or join entry.

Accessibility & Screen Reader Announcements:

- The UI must provide real-time accessible announcements for screen readers and assistive technology.
- Important game events (piece locked by self/others, piece placed, puzzle completion, player joins/leaves, AFK releases) must be announced via accessible live region notifications.

Confirmation dialogs:

- A leave room confirmation must appear when a connected player intentionally leaves an active, incomplete room.
- Browser refresh, tab close, and navigation away must trigger a browser-supported warning when the player is connected to an active, incomplete room.
- Confirmation dialogs must not offer room saving, archiving, extension, or account-based recovery.

Reconnect overlay:

- Reconnect overlay must appear after extended network interruption.
- It must show that the app is reconnecting and that server state will be restored.
- It must not allow new piece claims while full-state recovery is pending.
- On success, the overlay disappears after the full current state renders.
- On failure after 5 attempts or 30 seconds, the player returns to join with a retry path.

Leave room confirmation:

- The confirmation must explain that leaving releases any held pieces after disconnect handling rules apply.
- Leaving does not delete the room unless the 24-hour TTL has expired.
- Other players must be able to continue if one player leaves.

Browser refresh warning:

- The warning must appear when supported by the browser and the player is connected to an active room.
- Refresh is treated as disconnect followed by reconnect.
- If refresh completes within 60 seconds, locks are restored.
- If refresh takes longer than 60 seconds, locks are released but room state remains until expiration.

### Visual Feedback

- Claimed pieces must show ownership to all players.
- Real-time movement must make other players' activity visible.
- Successful snap must be visibly confirmed through exact placement and placed-state styling.
- Placed pieces must be visually distinct and no longer selectable.
- The solve timer must remain visible during gameplay.
- Completion must clearly show the finished image and final solve time.

### Gameplay Visual States

| State | Cursor | Animation | Shadow | Opacity | Border / Glow / Highlight | Label Behavior | Transition Behavior | Player Feedback |
|---|---|---|---|---|---|---|---|---|
| Hover | Pointer cursor on claimable unplaced pieces; default cursor elsewhere. | Subtle elevation transition under 150ms. | Slight shadow increase. | 100%. | Thin neutral highlight. | No ownership label unless already locked. | Highlight appears on hover and clears on mouse exit. | Indicates the piece can be selected. |
| Piece selected | Grabbing cursor after local lock is granted. | Immediate elevation. | Stronger active shadow. | 100%. | Local-player outline appears. | Local ownership label or marker appears. | Selection begins only after server lock grant. | Player sees they control the piece. |
| Piece claimed | Pointer disabled for other players. | Ownership indicator fades in under 150ms. | Moderate shadow. | 100%. | Owner-specific outline plus non-color marker. | Owner display name or disambiguated marker appears. | Broadcast claim updates all clients. | All players see the piece is in use. |
| Piece locked | Not-allowed cursor for non-owners; grabbing cursor for owner during drag. | No idle animation required. | Elevated above unclaimed pieces. | 100%. | Persistent owner outline. | Owner label remains visible. | Lock remains until drop, snap, or grace expiration. | Prevents conflicting interaction. |
| Dragging | Grabbing cursor for owner. | Position follows drag input; remote clients interpolate between authoritative updates. | Highest movable-piece shadow. | 100%. | Active outline remains. | Label follows piece and must not cover most image content. | Active piece moves above other pieces. | Movement feels continuous and shared. |
| Released | Default cursor after release. | Piece settles in place under 150ms if not snapped. | Returns to unclaimed shadow. | 100%. | Ownership outline clears if not snapped. | Ownership label disappears if not snapped. | Server release result determines final state. | Piece becomes available if not placed. |
| Incorrect placement | Pointer cursor returns because piece is claimable. | No error shake, penalty animation, or failure badge. | Unclaimed shadow. | 100%. | No incorrect marker. | No ownership label. | Piece remains at released coordinates. | Mistake is recoverable without punishment. |
| Successful snap | Default cursor after placement. | Snap animation completes under 200ms and lands at exact target position. | Shadow reduces to placed state. | 95-100% consistent with board integration. | Placement highlight or brief glow may appear and fade under 300ms. | Ownership label disappears. | Server snap result broadcasts to all clients. | Player receives clear confirmation. |
| Placed piece | Default cursor; no pointer affordance. | No idle animation. | Minimal or no shadow. | 95-100%. | No owner border; board-integrated edge treatment. | No label. | State is permanent. | Piece is visibly complete and immovable. |
| Completed puzzle | Default cursor. | Completion overlay appears under 300ms. | Board appears unified. | 100%. | Puzzle frame may remain visible; no active highlights. | Player indicators may remain visible. | All movement disabled. | Solve time and completed image are shown. |
| Reconnect | Default cursor or disabled interaction cursor. | Reconnect overlay may pulse or show progress with reduced motion fallback. | Workspace may be dimmed. | Background 60-80%; overlay 100%. | No piece highlights except retained lock indicators after recovery. | Reconnect message appears. | Full state renders before interaction resumes. | Player knows state is being restored. |
| Disconnect | Disabled interaction cursor. | Overlay appears after extended interruption. | Workspace dimmed. | Background 60-80%. | Active controls disabled. | Disconnect or reconnecting message appears. | Buffered interactions are not shown as committed until server confirms. | Player understands play is temporarily interrupted. |
| Loading | Progress cursor where applicable. | Spinner or progress indicator with reduced motion alternative. | Not applicable. | Background may dim if blocking. | No gameplay highlight. | Loading text names the operation. | Clears when operation succeeds or fails. | Player knows the app is working. |
| Generating | Progress cursor. | Generation progress indicator. | Not applicable. | Upload flow may dim. | No gameplay highlight. | Generation label appears. | Success creates room; failure returns to upload. | Creator knows puzzle is being prepared. |
| Waiting | Default cursor. | Minimal passive loading indicator. | Not applicable. | 100%. | No active highlight. | Waiting text appears for join or state load. | Ends when board renders or error appears. | Player understands the room is loading. |
| Expired room | Default cursor. | Dialog or full-page state appears. | Not applicable. | Gameplay disabled. | No piece highlights. | Expiration message appears. | User returns to create or join entry. | Player understands room cannot be recovered. |
| Validation error | Default cursor. | Error appears without disruptive motion. | Not applicable. | 100%. | Error field highlight. | Error message names invalid field or file. | User remains in current flow with retry. | User knows what to correct. |
| Network loss | Disabled interaction cursor after connection loss is confirmed. | Reconnect overlay appears; reduced motion honored. | Workspace dimmed. | Background 60-80%. | Active piece highlights freeze until state recovery. | Reconnecting label appears. | Retries follow defined intervals. | Player knows actions may not be committed. |
| Browser refresh | Browser-defined cursor. | Browser-level navigation warning when supported. | Not applicable. | Not applicable. | Not applicable. | Warning explains active room interruption. | Refresh resumes through reconnect rules. | Player understands held pieces may release after grace. |

### Loading States

- Upload processing must show that the image is being validated or processed.
- Room joining must show progress from code submission to rendered board.
- Reconnection must show a clear reconnecting state during extended network interruption.
- Puzzle generation timeout must show a processing failure after 5 seconds under normal conditions and allow re-upload.
- Upload timeout must discard partial data and allow retry.
- Join timeout must return the player to join with code and display name retained where safe.

### Error States

- Invalid image: clear rejection before processing.
- File too large: clear message indicating the 10 MB limit.
- Upload failure: retry option with partial data discarded.
- Processing failure: re-upload path without penalty.
- Network interruption: reconnecting state rather than silent failure.
- Invalid code: clear invalid-room message.
- Full room: clear capacity message.
- Expired room: clear expiration message.
- Upload cancelled: return to upload state without creating an error, room, or analytics failure beyond cancellation reason.
- Browser offline: show network loss state and retry automatically when the browser reports connectivity.
- Server unavailable: show recoverable server-unavailable message and retry path; do not create duplicate rooms.
- Storage unavailable: show processing failure and discard incomplete upload state.
- Generation timeout: show processing failure and allow re-upload.
- Upload timeout: discard partial upload and allow retry.
- Join timeout: return to join screen with retry and retained code/name when safe.
- Reconnect timeout: after 5 attempts or 30 seconds, return to join with retry.
- Room expires during drag: immediately stop movement, release no further local actions, show expired-room state, and remove the player from the room.
- Room deleted while loading: show expired or unavailable room state and return to entry.
- Browser refresh: treat as disconnect and reconnect; show browser warning when supported.
- Tab close: treat as disconnect; locks follow 60-second grace period.
- Navigation away: show browser warning when supported and then treat as disconnect if confirmed.
- Unsupported browser: show unsupported-browser state before room creation or join.
- Unexpected disconnect: show reconnect overlay and follow reconnect rules.
- Duplicate reconnect: keep one active recovered session and ignore stale duplicate connection attempts.

### Empty States

- New room: all pieces are unplaced and scattered in the shared piece pool area.
- Post-completion: the completed image and solve time are visible; movement is disabled.

### Accessibility

- Critical actions must have screen-reader labels.
- Keyboard navigation must be supported where applicable for desktop browser entry flows and critical controls.
- Error messages must be perceivable as text, not only color.
- Ownership and placed-state indicators must not rely solely on color.
- Focus order must proceed from primary page action, to form inputs, to submit actions, to secondary navigation, and then to status messages.
- Room code entry, display name entry, image upload, grid selection, join, create, leave, retry, and close-dialog controls must be reachable by keyboard.
- Keyboard shortcuts must be limited to critical non-gameplay controls in MVP: Escape closes dismissible dialogs, Enter submits focused forms, and Tab/Shift+Tab move focus through controls.
- Dragging puzzle pieces by keyboard is not required for MVP, but keyboard users must be able to navigate entry flows, dialogs, and recovery actions.
- Critical buttons, inputs, dialogs, overlays, room code, timer, and error states must have appropriate accessible names and roles.
- Reconnect, error, completion, and expiration messages must be announced through assistive technology when they appear.
- Reduced motion preferences must disable non-essential motion, including hover elevation animation, snap glow animation, and loading pulse animation.
- High-contrast mode must preserve text readability, board frame visibility, ownership indicators, and placed-state distinction.
- Ownership indicators must combine color with text, outline pattern, icon, or label.
- Focus must not move unexpectedly during piece movement broadcasts from other players.

## 13. Information Architecture

### Landing Page

Purpose: Entry point for creating a new room or joining an existing room.

Permitted content:

- Create room entry.
- Join room entry.
- No profile, leaderboard, history, settings, daily puzzle, or social feed.

### Create Room / Upload & Grid Selection

Purpose: Let the creator select a local image, supported grid size, and display name, then create the room.

Permitted content:

- Image upload.
- Validation feedback.
- Grid size selection from 4x4 through 10x10.
- Display name entry.
- Generation progress and failure messages.

Excluded content:

- Image cropping, editing, rotating, filtering, AI generation, or pre-made image libraries.
- Cosmetic themes or piece-style selection.

### Join Room

Purpose: Let a player enter an existing room using only code and display name.

Permitted content:

- Room code input.
- Display name input.
- Join loading and error states.

Excluded content:

- Account login, OAuth, friend lists, user profiles, avatars, spectator selection, or public lobby browsing.

### Game Board

Purpose: The single gameplay screen where players solve the puzzle together.

Permitted content:

- Puzzle board and piece pool.
- Piece ownership indicators.
- Real-time piece movement.
- Timer.
- Room code display.
- Current player indicators using display names only.
- Reconnect overlay.
- Leave room confirmation.
- Browser-supported refresh or navigation warning.
- Reconnection and error states.

Board and viewport constraints:

- The board is centered within the available desktop workspace and preserves the uploaded image aspect ratio.
- The board is bounded by maximum visible size rules and maintains minimum padding where supported viewport space allows.
- The piece pool is visible in the same workspace; it is not a separate inventory page, drawer, or lobby.
- In-app zoom, pan, camera controls, minimap, and reset-view controls are not part of the MVP.
- Browser zoom is treated as a browser-level viewport change and is not synchronized across players.

Excluded content:

- Chat, voice, video, leaderboards, achievements, progression, racing, ghost replay, solo mode, room archive controls, or room extension controls.

### Completion Overlay

Purpose: Communicate the completed puzzle and final solve time.

Permitted content:

- Completed image.
- Final solve time.
- Clean View / Toggle Grid Lines control.
- Post-completion view-only state.

Excluded content:

- Generated result images, share cards, social media composition, rankings, achievements, or persistent history.

## 14. User Flow Diagrams

### Create Room Flow

Landing Page -> Create Room -> Select Image -> Validate Image -> Select Grid Size -> Enter Display Name -> Generate Puzzle And Create Room -> Generate Unique 8-Character Code -> Game Board.

Error branches:

- Invalid file -> Show specific error -> Retry upload.
- File over 10 MB -> Show size-limit error -> Retry upload.
- File below minimum resolution -> Show resolution error -> Retry upload.
- File above maximum dimensions -> Downscale if safe or reject if unsafe -> Continue or retry.
- Unsupported color space or corrupted metadata -> Normalize if safe or reject -> Retry upload.
- Upload cancelled -> Return to upload state -> No room created.
- Upload timeout -> Discard partial upload -> Retry upload.
- Corrupted image or processing failure -> Show processing error -> Re-upload.
- Generation timeout -> Show processing error -> Re-upload.
- Upload or generation failure -> Retain selected grid size and display name in form while resetting file input.
- Server or storage unavailable -> Show recoverable error -> Retry without duplicate room creation.
- Code collision -> Regenerate code internally -> Continue only once active-room-unique code exists.

### Join Room Flow

Landing Page -> Join Room -> Enter Code -> Enter Display Name -> Validate Room -> Load Full Room State -> Game Board.

Error branches:

- Invalid code -> Show invalid-code error -> Retry.
- Expired room -> Show expired-room error -> Return to join or create entry.
- Full room -> Show full-room error -> Return to join or create entry.
- Join timeout -> Return to join with retry -> Preserve entered code and name when safe.
- Unsupported browser -> Show unsupported-browser state -> Do not enter gameplay.
- Network failure during join -> Show loading or retry state -> Retry.

### Piece Claim & Move Flow

Game Board -> Player selects unclaimed piece -> Server validates lock -> Lock granted -> Ownership indicator appears -> Player drags piece -> Server validates movement -> Position broadcasts to all players.

Conflict branch:

- Another player claims first -> Server rejects lock -> Player receives feedback -> Player selects another piece.
- Piece has already snapped or puzzle has completed -> Server rejects claim -> Player receives feedback -> Piece remains immovable.
- Connection drops during claim -> Reconnect overlay appears -> Full state recovery determines whether claim succeeded.

### Snap / Incorrect Placement Flow

Player releases locked piece -> Server calculates distance to correct grid position.

Successful snap:

Within 25% of the shorter piece dimension -> Server snaps piece exactly -> Marks placed -> Releases lock -> Broadcasts placed state -> Piece becomes immovable.

Incorrect placement:

Outside threshold -> Piece remains at released coordinates -> Lock releases -> Piece is available to all players -> No penalty and no incorrect-placement marker.

Expiration branch:

Room expires during drag -> Server deletes room -> Client stops movement -> Expired-room state appears -> Player returns to entry.

### Disconnect & Reconnect Flow

Player disconnects -> Server retains locks for 60 seconds -> Client attempts reconnect.

Reconnect within grace:

Persisted `sessionId` and room code -> Full state refresh -> Locks restored -> Gameplay resumes.

Reconnect after grace:

Persisted `sessionId` and room code -> Full state refresh -> Former locks already released -> Gameplay resumes if room is active.

Failure branch:

Repeated reconnect failure -> Player returns to join screen with retry option.

Refresh and navigation branch:

Browser refresh, tab close, or navigation away -> Browser-supported warning appears when possible -> If confirmed, player disconnects -> 60-second lock grace period begins -> Reconnect follows the same grace rules.

### Room Expiration Flow

Room reaches 24 hours from creation -> Room and associated data are permanently deleted -> Connected players are notified and removed -> Future join attempts fail because the room no longer exists or has expired -> Code may be reused.

## 15. Feature Prioritization (MoSCoW)

### Must Have

- Image Upload & Validation.
- Puzzle Generation.
- Room Management.
- Anonymous Entry (including session persistence).
- Piece Ownership & Locking (including AFK auto-release).
- Real-Time Synchronization.
- Snap-to-Fit & Placement.
- Completion Detection (including Clean View toggle).
- Disconnect, Reconnect & Grace Period.
- Room Persistence & Cleanup.
- Gameplay Workspace, Board, Piece Pool & Viewport.
- Security & Abuse Protection (including content safety screening).
- Duplicate-name disambiguation in player lists and ownership indicators.

### Should Have

- Expiring-soon warning at 23h30m.
- Extended network interruption messaging.
- Failed reconnect return-to-join path.
- Graceful gameplay degradation for players above 300ms RTT.
- Client interpolation for remote piece movement.
- Browser-supported refresh, tab-close, and navigation warnings.

### Could Have

- No MVP modules are P2 by default. Any P2 work must remain within the established MVP surface and must not introduce out-of-scope features.

### Won't Have

- Spectator Mode.
- Solo Play.
- Ghost Replay / Racing.
- Generated Image Result Cards.
- User Accounts.
- OAuth / Social Login.
- Friend Lists.
- Global Leaderboards.
- Daily Curated Puzzles.
- Cosmetic Themes.
- Mobile-Optimized Touch Controls.
- In-App Chat.
- In-App Voice Communication.
- Piece Rotation.
- Custom Grid Sizes.
- Room Extension / Archiving.
- Image Editing / Cropping.
- AI-Generated Images.
- Monetization, payments, subscriptions, or advertisements.

## 16. Risks

### Product Risks

- Lock contention in 6-player rooms may make high-participation sessions feel crowded.
- Snap threshold tuning may be too strict, causing frustration, or too generous, reducing challenge.
- Rooms with fewer than 2 players may not demonstrate the product's intended collaborative value even though the creator can exist alone in a room.
- Dense 10x10 puzzles may make the initial piece pool feel crowded even with overlap limits.
- Desktop viewport constraints may exclude users on small laptop windows or heavy browser zoom.

### Technical Risks

- Real-time synchronization at scale may fail to maintain sub-100ms perceived responsiveness.
- Server-authoritative locking must prevent simultaneous manipulation 100% of the time.
- Image processing failures may interrupt the creator flow and increase abandonment.
- Strict room isolation is required to prevent any state leakage.
- Image validation must prevent malformed files, oversized decoded dimensions, image bombs, and unsafe metadata from reaching generation.
- Browser resize and full-state recovery must preserve logical positions while recalculating visual scale.
- Duplicate reconnects and duplicate retried actions must be handled idempotently.

### UX Risks

- High-latency players above 300ms RTT may feel less included due to less fluid piece movement.
- Accidental drops outside the snap threshold may create frustration if visual feedback is unclear.
- Duplicate display names may confuse ownership indicators if not subtly disambiguated.
- Reconnection states must be clear enough to avoid players assuming progress was lost.
- High-latency players may experience a slight delay between clicking and dragging, as clients must wait for server lock approval before initiating local drag.
- No in-app zoom or pan may frustrate users on smaller desktop viewports, but adding camera controls is out of MVP scope.
- Browser refresh and navigation warnings are browser-dependent and may not appear consistently in every supported browser.

### Legal / Privacy Risks

- Users may upload images they do not own or license; the product assumes responsibility lies with the uploader and does not perform copyright checks.
- User-uploaded content must remain ephemeral and deleted after 24 hours.
- Display names may contain arbitrary characters that pass sanitization; no profanity filtering or reservation is performed.
- The product must avoid collecting personally identifiable information.
- Anonymous rate limiting must reduce abuse without creating persistent identity.
- Analytics must remain aggregate, room-scoped, and session-scoped without introducing persistent user tracking.

## 17. Assumptions

| # | Assumption | Rationale |
|---|---|---|
| 1 | Supported file formats are limited to common web raster formats, such as JPEG, PNG, WebP, and GIF. Vector formats are not supported. | Ensures predictable server-side processing and browser rendering. |
| 2 | Maximum file size is 10 MB. | Balances quality with upload time and processing capacity. |
| 3 | Communication outside the application is the responsibility of the players. The product does not provide chat, voice, or invite mechanisms beyond the room code. | Keeps scope focused and leverages tools players already use. |
| 4 | Supported browsers are the latest two versions of Chrome, Firefox, Safari, and Edge on desktop operating systems. | Defines the testing and compatibility matrix. |
| 5 | Intended player counts are 2-6 per room. The product is not designed for solo play, large groups, or public lobbies. | Informs UI density, lock contention probability, and server load assumptions. |
| 6 | Players have stable broadband internet with latency under 300ms to the server region. | Defines the target network environment for acceptable gameplay. |
| 7 | Images are owned or licensed by the uploader. The product does not perform copyright checks. | Legal responsibility lies with the user; the platform acts as a transient processing tool. |
| 8 | Display names are ephemeral and must comply with the explicit validation and sanitization rules defined in Section 10.4 (max 30 chars, allowed charset, HTML escaping, whitespace stripping). No profanity filtering or name reservation is performed. | Minimizes moderation overhead for the MVP. |
| 9 | Server time is authoritative for the solve timer. Client clocks are not trusted. | Ensures fair and consistent timing across all players. |
| 10 | Room codes are 8 characters, case-insensitive, and use the charset `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, excluding visually ambiguous characters such as `0/O`, `1/I`, and `L`. | Reduces user error when communicating codes verbally or in text. |

## 18. Dependencies

### External

- None.
- No OAuth providers.
- No payment providers.
- No AI APIs.
- No third-party communication systems embedded in the product.

### Internal

- Image processing pipeline.
- Real-time synchronization infrastructure.
- Code-generation uniqueness service.
- Server-authoritative room state management.
- Ephemeral room cleanup process.
- Image validation, sanitization, metadata stripping, dimension normalization, and safe downscaling capability.
- Workspace layout and scaling logic for desktop board, piece pool, and resize behavior.
- Anonymous rate-limiting controls for uploads, room creation, joins, invalid code attempts, and reconnects.
- Room-scoped analytics instrumentation for KPI and failure-reason measurement.

## 19. Open Questions

The following items remain open for product/design polish but have documented defaults for implementation prompt generation:

| Question | Default For Implementation |
|---|---|
| Final approved user-facing copy for invalid image, upload failure, generation timeout, invalid code, full room, expired room, reconnect failure, and unsupported browser states | Use the error-state names in Section 12 and the TRD error codes (`INVALID_UPLOAD`, `ROOM_FULL`, `ROOM_EXPIRED`, etc.) with concise, action-oriented placeholder copy. Example: "This room code is invalid. Check the code and try again." |
| Additional anonymous abuse-control mechanisms if rate limiting is insufficient | Rate limiting per anonymous client context and network boundary is the MVP default. Post-MVP options include CAPTCHA on repeated failures and IP reputation scoring; neither is in MVP scope. |
| Exact visual design tokens for ownership outlines, placed-state integration, and high-contrast variants | Follow the Gameplay Visual States table in Section 12. Ownership must combine color with text, outline, or icon. Placed pieces use reduced shadow and no ownership label. High-contrast mode must preserve frame, ownership, and placed-state distinction. |


