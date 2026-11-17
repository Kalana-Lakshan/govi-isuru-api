> **v2 note:** the system is now three repositories: `govi-isuru-web` (Next.js), `govi-isuru-api` (this one) and `govi-isuru-ai-service`. Sections 4 and 4a and the integration notes describe the v2 AI flow; the other workflows are unchanged from v1.

# 🔄 Govi Isuru - Feature Integration & Workflow Details

## 1. Complete Disease Detection to Community Alert Flow

```mermaid
graph TB
    START["🌾 Farmer Notices Symptoms<br/>on Crop Leaf"]
    
    START --> OPEN_APP["📱 Opens Govi Isuru App"]
    OPEN_APP --> NAV_HUB["Navigates to<br/>Crop Care Hub"]
    
    NAV_HUB --> OPEN_DOCTOR["Selects AI Doctor<br/>Disease Detection"]
    
    OPEN_DOCTOR --> SELECT_CROP["🌾 Step 1:<br/>Select Crop Type<br/>Rice/Tea/Chili"]
    SELECT_CROP --> UPLOAD_IMG["📸 Step 2:<br/>Upload Leaf Photo"]
    
    UPLOAD_IMG --> CHECK_CREDITS["💳 Pre-Check Credits<br/>Required: 10 credits<br/>Available: ?"]
    
    CHECK_CREDITS -->|Insufficient| SHOW_BUY["Show Credit<br/>Purchase Modal"]
    SHOW_BUY --> BUY_CREDITS["💰 Farmer Buys<br/>Credits (Stripe)"]
    BUY_CREDITS --> ADD_CREDITS["Credits Added<br/>to Account"]
    ADD_CREDITS --> DEDUCT["Deduct 10 Credits<br/>for AI Call"]
    
    CHECK_CREDITS -->|Sufficient| DEDUCT
    
    DEDUCT --> SEND_AI["🚀 Send Request<br/>to FastAPI<br/>AI Service"]
    
    SEND_AI --> PROCESS_AI["🧠 AI Service:<br/>1. Validate Image<br/>2. Load Model<br/>3. Preprocess<br/>4. Inference<br/>5. Generate GradCAM"]
    
    PROCESS_AI --> GET_RESULT["🔍 AI Returns:<br/>- Disease Name<br/>- Confidence (98%)<br/>- Severity<br/>- GradCAM Heatmap"]
    
    GET_RESULT --> DISPLAY["📊 Display Results<br/>to Farmer"]
    
    DISPLAY --> SAVE_REPORT["💾 Save Report<br/>to MongoDB<br/>Disease.js Model"]
    
    SAVE_REPORT --> FARMER_OPTION{Farmer<br/>Decision}
    
    FARMER_OPTION -->|"Keep Private"| PRIVATE["✅ Report Saved<br/>Only Visible to Farmer<br/>Show Treatments"]
    
    FARMER_OPTION -->|"Report to Community"| REPORT_BTN["📢 Click<br/>'Report Alert'"]
    
    REPORT_BTN --> CREATE_ALERT["Create Alert Document<br/>Status: PENDING<br/>Officer Needs Review"]
    
    CREATE_ALERT --> NOTIFY_OFFICER["🔔 Push Notification<br/>to Local Officers<br/>New Alert in District"]
    
    NOTIFY_OFFICER --> OFFICER_LOGIN["👮 Officer Logs Into<br/>Officer Dashboard"]
    
    OFFICER_LOGIN --> OFFICER_VIEW["Views Pending<br/>Disease Reports<br/>- Farmer's Photo<br/>- AI Diagnosis<br/>- GPS Location"]
    
    OFFICER_VIEW --> OFFICER_DECISION{Officer<br/>Confirms?}
    
    OFFICER_DECISION -->|"Reject"| REJECT_ALERT["❌ Status: REJECTED<br/>- False Alarm<br/>- Farmer Notified"]
    
    OFFICER_DECISION -->|"Confirm"| VERIFY_ALERT["✅ Status: APPROVED"]
    
    VERIFY_ALERT --> ADD_EVIDENCE["Officer Optionally:<br/>- Adds Field Evidence<br/>- Photos<br/>- Observations"]
    
    ADD_EVIDENCE --> CREATE_COMMUNITY_ALERT["📢 Create Community-Wide<br/>Alert"]
    
    CREATE_COMMUNITY_ALERT --> CALC_SEVERITY["⚠️ Calculate Severity<br/>1. Location Cluster<br/>2. Weather Check<br/>3. Spread Analysis<br/>4. Assign: Low/Med/High"]
    
    CALC_SEVERITY --> BROADCAST["📡 Broadcast Alert<br/>to All Farmers in<br/>- Same GN Division<br/>- Nearby Districts<br/>- Same Crop Type"]
    
    BROADCAST --> NOTIF_FARMERS["🔔 Farmers Receive:<br/>- Push Notification<br/>- In-App Alert<br/>- Email/SMS"]
    
    NOTIF_FARMERS --> COMMUNITY_VIEW["👥 Farmers View<br/>Disease Alerts<br/>Dashboard:<br/>- Alert Card<br/>- Severity Badge<br/>- Treatments<br/>- Count of Reports"]
    
    COMMUNITY_VIEW --> DISCUSS["💬 Community Discussion<br/>- Share Experiences<br/>- Discuss Solutions<br/>- Post Photos"]
    
    DISCUSS --> TREATMENTS["💊 Access Treatment<br/>Recommendations<br/>- Organic Methods<br/>- Chemical Solutions<br/>- Preventive Measures"]
    
    TREATMENTS --> IMPLEMENT["🌾 Farmers Implement<br/>Solutions"]
    
    IMPLEMENT --> RECOVERY["✅ Disease Controlled<br/>in Area"]
    
    RECOVERY --> ARCHIVE["📂 Alert Archived<br/>Status: RESOLVED<br/>Stored for Analytics"]
    
    PRIVATE --> END["✅ END - Private Report"]
    REJECT_ALERT --> END
    ARCHIVE --> END["✅ END - Community Alert"]

    style START fill:#fff9c4
    style CHECK_CREDITS fill:#ffccbc
    style PROCESS_AI fill:#f3e5f5
    style DISPLAY fill:#c8e6c9
    style FARMER_OPTION fill:#ffe0b2
    style OFFICER_DECISION fill:#ffe0b2
    style BROADCAST fill:#ffccbc
    style COMMUNITY_VIEW fill:#bbdefb
    style TREATMENTS fill:#c8e6c9
    style END fill:#a5d6a7
```

---

## 2. Marketplace Transaction Complete Workflow

```mermaid
graph TB
    subgraph "FARMER PREPARATION"
        F1["👨‍🌾 Farmer Logs In"]
        F2["📝 Navigate to 'Create Listing'"]
        F3["🌾 Enter Crop Details:<br/>- Crop Type<br/>- Variety<br/>- Quality Grade (A/B/C)<br/>- Harvest Date<br/>- Quantity (kg)<br/>- Price (LKR/kg)<br/>- Description"]
    end

    subgraph "IMAGE UPLOAD"
        F4["📸 Upload Images<br/>(Max 5, 5MB each)"]
        F5["✅ Multer Validation:<br/>- File Type Check<br/>- Size Limit Check<br/>- Virus Scan"]
        F6["💾 Save to:<br/>uploads/listings/<br/>listing-{timestamp}-{random}.jpg"]
    end

    subgraph "LISTING PUBLICATION"
        F7["✅ Create Listing Record<br/>in MongoDB<br/>- farmerId<br/>- cropType<br/>- images[]<br/>- status: ACTIVE<br/>- createdAt"]
        F8["📢 Listing Goes Live<br/>Visible to Buyers"]
    end

    subgraph "BUYER DISCOVERY"
        B1["🛍️ Buyer Logs In<br/>(as BUYER role)"]
        B2["🔍 Open Marketplace<br/>or Access via<br/>Market Hub"]
        B3["🎛️ Browse/Filter:<br/>- Crop Type<br/>- District<br/>- Quality<br/>- Price Range"]
        B4["📋 View Listings<br/>See Farmer Profile:<br/>- Name<br/>- Rating ⭐<br/>- Previous Sales<br/>- Verified Badge✓"]
    end

    subgraph "BUYER SAVES & COMMUNICATES"
        B5["❤️ Save to<br/>Saved Listings<br/>(buyer.savedListings)"]
        B6["💬 Contact Farmer<br/>- Click Message Button<br/>- Send Initial Inquiry"]
        B7["📨 Message Sent to:<br/>- Farmer's In-App<br/>- Email Notification<br/>- SMS (optional)"]
    end

    subgraph "FARMER RESPONDS"
        F9["🔔 Farmer Notified<br/>New Message<br/>from Buyer"]
        F10["💬 Farmer Reviews<br/>- Buyer Inquiry<br/>- Buyer Rating<br/>- Previous Purchases"]
        F11["✍️ Farmer Responds:<br/>- Confirms Details<br/>- Negotiates Price<br/>- Suggests Delivery<br/>- Answers Questions"]
    end

    subgraph "NEGOTIATION & BOOKING"
        N1["🤝 Back & Forth<br/>Messaging<br/>Price, Delivery Date<br/>Pickup Location"]
        N2["✅ Agree on Terms:<br/>- Final Price<br/>- Delivery Method<br/>- Pickup Date/Time<br/>- Payment Method"]
    end

    subgraph "MANUAL BOOKING CREATION"
        MB1["📅 Create Manual<br/>Booking Record"]
        MB2["📝 Booking Details:<br/>- buyerId<br/>- farmerId<br/>- listingId<br/>- quantity_ordered<br/>- agreed_price<br/>- delivery_date<br/>- pickup_location<br/>- payment_method"]
        MB3["💾 Store in MongoDB<br/>ManualBooking Model<br/>status: CONFIRMED"]
    end

    subgraph "PAYMENT HANDLING"
        P1["💳 Payment Methods:<br/>1. Cash on Delivery<br/>2. Bank Transfer<br/>3. Mobile Money"]
        P2["📝 Record in System:<br/>- Amount<br/>- Method<br/>- Confirmation<br/>- Invoice Generated"]
    end

    subgraph "PHYSICAL DELIVERY"
        D1["🚚 Pickup/Delivery Day<br/>- Farmer Prepares<br/>  Produce<br/>- Buyer Arrives/<br/>  Delivery"]
        D2["✅ Quality Check<br/>Buyer Inspects<br/>- Quantity<br/>- Freshness<br/>- Quality Grade"]
        D3["💰 Payment Settled<br/>- If COD, Pay Now<br/>- If Transfer, Confirm"]
    end

    subgraph "FEEDBACK & REPUTATION UPDATE"
        FB1["⭐ Feedback Exchange<br/>Buyer Rates 1-5 Stars<br/>Farmer Rates Buyer"]
        FB2["💬 Written Review<br/>(Optional Comments)"]
        FB3["📊 Store Feedback<br/>in Feedback Model<br/>- rating<br/>- review_text<br/>- timestamp<br/>- reviewer_id"]
    end

    subgraph "REPUTATION IMPACT"
        REP1["📈 Update Farmer<br/>Reputation Score<br/>New Avg from all<br/>feedback ratings"]
        REP2["📊 Update Metrics:<br/>- total_sales ++<br/>- total_feedbacks ++<br/>- verified_listings ++"]
        REP3["✅ Check Badge<br/>If avg >= 4.0:<br/>Add Verified Farmer ✓"]
    end

    subgraph "COMPLETION"
        C1["✅ Close Booking<br/>status: COMPLETED"]
        C2["📚 Archive for<br/>Analytics &<br/>History"]
    end

    F1 --> F2 --> F3 --> F4 --> F5 --> F6 --> F7 --> F8

    B1 --> B2 --> B3 --> B4 --> B5 --> B6 --> B7

    F8 -->|visible| B4
    B7 --> F9 --> F10 --> F11

    F11 --> N1 --> N2

    N2 --> MB1 --> MB2 --> MB3

    MB3 --> P1 --> P2

    P2 --> D1 --> D2 --> D3

    D3 --> FB1 --> FB2 --> FB3

    FB3 --> REP1 --> REP2 --> REP3

    REP3 --> C1 --> C2

    style F1 fill:#c8e6c9
    style B1 fill:#bbdefb
    style N1 fill:#fff9c4
    style D1 fill:#ffccbc
    style FB1 fill:#f8bbd0
    style REP1 fill:#fff9c4
    style C2 fill:#a5d6a7
```

---

## 3. Officer Consultation Booking Complete Workflow

```mermaid
graph TB
    subgraph "OFFICER SETUP"
        OFF1["👨‍💼 Agricultural Officer<br/>Signs Up as OFFICER"]
        OFF2["📋 Officer Details:<br/>- Full Name<br/>- Officer ID<br/>- Department<br/>- Designation<br/>- Expertise Areas<br/>- Phone/WhatsApp"]
        OFF3["⏰ Set Availability<br/>- Working Hours<br/>- Consultation Slots<br/>- Days Available<br/>- Session Duration<br/>(usually 30-60 min)"]
        OFF4["✅ Create Consultation<br/>Slots in InstructorSlot<br/>Model"]
    end

    subgraph "FARMER DISCOVERY"
        F1["👨‍🌾 Farmer Clicks<br/>Consultation Hub"]
        F2["👥 View Available<br/>Officers/Instructors"]
        F3["🔍 Filter by:<br/>- Expertise<br/>- Availability<br/>- Rating<br/>- Cost (Credits/Session)"]
        F4["📋 View Officer Profile:<br/>- Bio<br/>- Experience<br/>- Previous Session Count<br/>- Farmer Reviews<br/>- ⭐ Rating"]
    end

    subgraph "BOOKING PROCESS"
        B1["📅 Click 'Book Session'"]
        B2["⏰ Select Available<br/>Slot:<br/>- Date<br/>- Time<br/>- Duration"]
        B3["💳 Check Credits:<br/>- Session Cost: 50 credits<br/>- User Credits: ?"]
    end

    subgraph "CREDIT CHECK & DEDUCTION"
        C1{Sufficient<br/>Credits?}
        C1 -->|No| C2["Show Credit<br/>Purchase Modal"]
        C1 -->|Yes| C3["Reserve Slot"]
        C2 --> C4["Farmer Buys Credits<br/>via Stripe"]
        C4 --> C5["Credits Added<br/>to Balance"]
        C5 --> C3
    end

    subgraph "BOOKING CONFIRMATION"
        C3 --> CONF1["✅ Create InstructorSlot<br/>Status: BOOKED<br/>- instructorId<br/>- farmerId<br/>- session_date<br/>- session_time<br/>- duration<br/>- credits_paid: 50"]
        CONF1 --> CONF2["Create Session Record<br/>Session Model:<br/>- session_id<br/>- topic<br/>- mode: VIDEO/AUDIO<br/>- status: SCHEDULED"]
    end

    subgraph "NOTIFICATIONS"
        NOTIF1["🔔 Farmer Receives<br/>- Booking Confirmation<br/>- Session Details<br/>- Officer Contact<br/>- Zoom/Meet Link"]
        NOTIF2["🔔 Officer Receives<br/>- New Booking Alert<br/>- Farmer Details<br/>- Farmer's Crop/Issue<br/>- Session Link"]
    end

    subgraph "PRE-SESSION"
        PRE1["📸 Farmer Prepares:<br/>- Take Crop Photos<br/>- Note Issues<br/>- Prepare Questions"]
        PRE2["📞 Officer Prepares:<br/>- Review Farmer Info<br/>- Gather Resources<br/>- Prepare Materials"]
    end

    subgraph "SESSION CONDUCT"
        SESSION1["⏰ Session Time<br/>Officer & Farmer Join<br/>Video Conference"]
        SESSION2["🎥 Session Topics:<br/>- Crop Problem Analysis<br/>- Visual Inspection<br/>(via photos/video)<br/>- Treatment Options<br/>- Prevention Tips<br/>- Q&A"]
        SESSION3["📝 Officer Takes<br/>Notes in Session<br/>Records Advice<br/>provided"]
    end

    subgraph "SESSION COMPLETION"
        END1["✅ Session Ends<br/>Status: COMPLETED<br/>Duration logged"]
        END2["📋 Farmer Views<br/>Session Summary:<br/>- Notes<br/>- Recommendations<br/>- Resources<br/>- Follow-up"]
    end

    subgraph "FEEDBACK EXCHANGE"
        FB1["⭐ Farmer Rates<br/>1-5 Stars<br/>- Clear Explanation<br/>- Helpful Solutions<br/>- Officer Behavior"]
        FB2["💬 Written Feedback<br/>- What Worked?<br/>- What to Improve?"]
        FB3["📊 Store in Feedback<br/>- rating<br/>- review<br/>- feedback_type<br/>: CONSULTATION"]
    end

    subgraph "OFFICER REPUTATION"
        REP1["📈 Update Officer<br/>Session Count<br/>total_sessions++"]
        REP2["⭐ Officer Rating<br/>Calculated from<br/>session feedback"]
        REP3["👑 Achieve Status<br/>10+ Sessions = ?<br/>Top Instructor"]
    end

    subgraph "RESOURCES PROVIDED"
        RES1["📚 Access Resources<br/>- Saved Notes<br/>- Video Recording<br/>(if allowed)<br/>- PDF Handouts"]
        RES2["📖 Related Guides<br/>- Disease Database<br/>- Crop Care Tips<br/>- Government Links"]
    end

    OFF1 --> OFF2 --> OFF3 --> OFF4

    F1 --> F2 --> F3 --> F4

    B1 --> B2 --> B3
    B3 --> C1

    C3 --> CONF1 --> CONF2
    CONF2 --> NOTIF1
    CONF2 --> NOTIF2

    NOTIF1 --> PRE1
    NOTIF2 --> PRE2

    PRE1 --> SESSION1
    PRE2 --> SESSION1
    SESSION1 --> SESSION2 --> SESSION3 --> END1

    END1 --> END2 --> FB1 --> FB2 --> FB3

    FB3 --> REP1 --> REP2 --> REP3

    END2 --> RES1 --> RES2

    style OFF1 fill:#bbdefb
    style F1 fill:#c8e6c9
    style SESSION2 fill:#fff9c4
    style FB1 fill:#f8bbd0
    style REP1 fill:#fff9c4
    style RES1 fill:#e3f2fd
```

---

## 4. AI Doctor System - Complete Request Flow

The backend forwards the photo to the AI service (repo `govi-isuru-ai-service`), which answers with one of seven statuses. Credits are refunded when no diagnosis is possible.

```mermaid
sequenceDiagram
    participant User as 👨‍🌾<br/>Web app
    participant API as 🌐<br/>Express API
    participant Credits as 💳<br/>Credit<br/>middleware
    participant AI as 🤖<br/>AI service
    participant DB as 🗄️<br/>MongoDB
    participant Officer as 👮<br/>Officers

    User->>API: POST /api/ai/predict/rice (photo, JWT)
    API->>API: rate limit (40 per 10 min) · verify JWT
    API->>Credits: deduct 25 credits
    Credits->>DB: lazy daily reset, then -25
    API->>AI: POST /v1/disease/predict?crop=rice&heatmap=true (X-API-Key)
    AI-->>API: status, class, confidence, top3, heatmap, embedding, photo_quality
    API->>API: add names, advice, severity from /v1/classes (cached 10 min)

    alt BAD_PHOTO / NOT_A_PLANT / UNSUPPORTED_PLANT / WRONG_CROP
        API->>DB: refund 25 credits
        API-->>User: message + advice (wrong crop: one-tap "Diagnose as chili")
    else UNKNOWN_DISEASE
        API->>DB: save UnknownCase (photo, district, embedding)
        API->>DB: 3 or more cases of this crop in the district in 7 days?
        DB-->>API: yes, notify the district officers
        API-->>User: "Sent to an agricultural officer" + case number
        API-->>Officer: Notification "Possible new rice disease in DISTRICT"
    else LOW_CONFIDENCE
        API-->>User: possible causes, consult an officer
    else KNOWN_DISEASE
        API-->>User: diagnosis, Sinhala name, heatmap, treatment steps
        User->>API: POST /api/reports (optional disease report, community alerts)
    end
```

### 4a. Unknown diseases: officer review (new in v2)

```mermaid
flowchart TB
    P["UNKNOWN_DISEASE answers"] --> S[("UnknownCase<br/>photo · crop · district · embedding · pending")]
    S --> A{"3 or more pending cases of one crop<br/>in a district within 7 days?"}
    A -->|yes| N["🔔 Notification to that district's officers<br/>(English + Sinhala)"]
    O["👮 Officer dashboard: Unknown diseases"] --> L["List pending cases by crop"]
    L --> G["Group similar cases<br/>POST /api/ai/unknown-cases/cluster<br/>to AI /v1/disease/unknowns/cluster"]
    G --> R["Groups: representative photo,<br/>districts, closest known disease"]
    R -->|"confirm with a snake_case name"| C["POST /api/ai/unknown-cases/confirm<br/>to AI /v1/disease/prototypes"]
    C --> K["Matching photos now return KNOWN_DISEASE<br/>(source: officer_prototype) without retraining"]
    C --> T["Confirmed photos go into the next Colab training round"]
    R -->|"not a disease"| D["dismiss"]
```

---

## 5. Hub Navigation & Feature Access Matrix

```mermaid
graph TB
    subgraph "NAVIGATION ENTRY"
        HOME["🏠 Dashboard<br/>All Users"]
        HUBS["📍 Hub Navigation<br/>- Farmer Hub<br/>- Crop Care Hub<br/>- Market Hub<br/>- Consultation Hub"]
    end

    subgraph "👨‍🌾 FARMER HUB"
        FH1["📊 My Farm Overview<br/>- Reputation Score ⭐<br/>- Total Sales<br/>- Reviews Count<br/>- Active Listings"]
        FH2["🔗 Hub Cards<br/>- Crop Care Hub<br/>- Market Hub<br/>- Consultation Hub"]
        FH_FLOW["Farm → See Stats<br/>→ Browse Other Hubs"]
    end

    subgraph "🦠 CROP CARE HUB"
        CCH1["🎓 Learn & Diagnose<br/>- AI Doctor<br/>- Disease Database<br/>- Care Tips"]
        CCH2["🌾 By Crop Info<br/>- Rice Varieties<br/>- Tea Cultivation<br/>- Chili Growing"]
        CCH3["💊 Get Treatments<br/>- Browse Diseases<br/>- View Solutions<br/>- Access Guides"]
        CCH_FLOW["Crop Selection<br/>→ Browse Diseases<br/>→ Get Solutions"]
    end

    subgraph "🛒 MARKET HUB"
        MH1["🌾 My Listings<br/>- Create New<br/>- Edit Existing<br/>- View Sales"]
        MH2["👥 Buyer Connections<br/>- Browse Buyers<br/>- Rate Cooperation<br/>- See Patterns"]
        MH3["📊 Market Insights<br/>- Crop Prices<br/>- Trends<br/>- Demand"]
        MH_FLOW["Browse Buyers<br/>→ Check Prices<br/>→ Create Listing"]
    end

    subgraph "👨‍🏫 CONSULTATION HUB"
        CON1["📅 Find Officers<br/>- View Available<br/>- Check Ratings<br/>- See Schedules"]
        CON2["🗓️ Book Session<br/>- Select Time<br/>- Pay Credits<br/>- Get Link"]
        CON3["📚 Resources<br/>- Session Notes<br/>- Recordings<br/>- Handouts"]
        CON_FLOW["View Officers<br/>→ Select & Book<br/>→ Attend Session"]
    end

    subgraph "FEATURE ACCESS RESTRICTIONS"
        FARMER["👨‍🌾 Farmer User:<br/>✅ All 4 Hubs<br/>+ AI Doctor<br/>+ Marketplace<br/>+ Consultations"]
        BUYER["🛍️ Buyer User:<br/>✅ Market Hub<br/>(View Listings)<br/>❌ Can't Create<br/>❌ Consultation<br/>(Limited)"]
        OFFICER["👮 Officer User:<br/>✅ Consultations<br/>(Provide Sessions)<br/>❌ Market Hub<br/>✅ Crop Care<br/>(Share Knowledge)"]
    end

    HOME --> HUBS

    HUBS --> FH1
    HUBS --> CCH1
    HUBS --> MH1
    HUBS --> CON1

    FH1 -->|Access| FH2
    FH2 --> CCH_FLOW
    FH2 --> MH_FLOW
    FH2 --> CON_FLOW

    CCH1 --> CCH2
    CCH2 --> CCH3

    MH1 --> MH2
    MH2 --> MH3

    CON1 --> CON2
    CON2 --> CON3

    CCH_FLOW --> FARMER
    MH_FLOW --> FARMER
    CON_FLOW --> FARMER

    style FH1 fill:#fff3e0
    style CCH1 fill:#e3f2fd
    style MH1 fill:#f3e5f5
    style CON1 fill:#e8f5e9
    style FARMER fill:#c8e6c9
    style BUYER fill:#ffccbc
    style OFFICER fill:#bbdefb
```

---

## 6. Real-Time Notification System

```mermaid
graph TB
    subgraph "TRIGGER EVENTS"
        E1["🔔 New Disease Alert<br/>Approved in District"]
        E2["💬 Message from Buyer<br/>About Listing"]
        E3["⭐ New Feedback<br/>on Listing/Session"]
        E4["📅 Upcoming Consultation<br/>24h Reminder"]
        E5["💳 Low Credit Balance<br/>Less Than 50"]
        E6["📬 Officer Approved<br/>New Admin"]
    end

    subgraph "NOTIFICATION SERVICE"
        NS["🔔 Notification Engine<br/>- Check Event Type<br/>- Find Recipients<br/>- Format Messages<br/>- Route to Channels"]
    end

    subgraph "DELIVERY CHANNELS"
        PUSH["📱 Push Notification<br/>- Firebase Cloud<br/>  Messaging<br/>- In-App Badge"]
        EMAIL["📧 Email<br/>- SendGrid<br/>- HTML Template<br/>- Unsubscribe"]
        SMS["📱 SMS<br/>- Twilio<br/>- Text Message<br/>- Regional Language"]
        INAPP["🔔 In-App Alert<br/>- Notification Center<br/>- Toast Message<br/>- Notification Count"]
    end

    subgraph "STORAGE & TRACKING"
        STORE["💾 Store Notification<br/>in Database<br/>- recipient_id<br/>- notification_type<br/>- content<br/>- channels_sent<br/>- is_read<br/>- created_at"]
        TRACK["📊 Track Delivery<br/>- Sent Status<br/>- Read Status<br/>- Click Through"]
    end

    subgraph "USER INTERACTION"
        READ["👁️ User Reads<br/>Notification"]
        ACTION["🔗 Click to<br/>Navigate to<br/>Relevant Feature"]
        ARCHIVE["🗂️ Archive<br/>Read Notifications"]
    end

    E1 --> NS
    E2 --> NS
    E3 --> NS
    E4 --> NS
    E5 --> NS
    E6 --> NS

    NS -->|Route| PUSH
    NS -->|Route| EMAIL
    NS -->|Route| SMS
    NS -->|Route| INAPP

    PUSH --> STORE
    EMAIL --> STORE
    SMS --> STORE
    INAPP --> STORE

    STORE --> TRACK

    TRACK --> READ
    READ --> ACTION
    ACTION --> ARCHIVE

    style E1 fill:#ffccbc
    style E2 fill:#bbdefb
    style E3 fill:#f8bbd0
    style PUSH fill:#e1f5fe
    style STORE fill:#e8f5e9
```

---

## 7. Admin Dashboard - User Lifecycle Management

```mermaid
graph TB
    subgraph "USER REGISTRATION"
        REG["📝 New User Registers<br/>- Farmer<br/>- Officer<br/>- Buyer"]
    end

    subgraph "ADMIN APPROVAL WORKFLOW"
        PENDING["⏳ New Officer Pending<br/>- Flag: isApproved: false<br/>- Status: pending"]
        REVIEW["👀 Admin Reviews<br/>- ID Verification<br/>- Department Check<br/>- Qualifications"]
        DECISION{Decision}
        APPROVE["✅ Approved<br/>Status: approved<br/>- Can Now Conduct<br/>  Sessions"]
        REJECT["❌ Rejected<br/>Status: rejected<br/>- Notify User<br/>- Reason Provided"]
    end

    subgraph "USER MANAGEMENT"
        ACTIVE["✅ Active Users<br/>- View List<br/>- Search/Filter<br/>- Check Status"]
        MONITOR["📊 Monitor Activity<br/>- Login History<br/>- Credit Usage<br/>- Feature Access"]
        SUSPEND["🚫 Suspend Users<br/>- For Violations<br/>- False Reports<br/>- Abusive Behavior"]
    end

    subgraph "REPUTATION OVERSIGHT"
        FALSE_REP["⚠️ Flag False Reports<br/>- Officer Reports<br/>  Incorrect Diagnosis"]
        CHECKS["✓ Verify Accuracy<br/>- Cross Check AI<br/>- Community Feedback"]
        PENALIZE["📉 Apply Penalties<br/>- Reduce Reputation<br/>- Flag Account<br/>- Suspend if Severe"]
    end

    subgraph "ANALYTICS DASHBOARD"
        STATS["📊 System Statistics<br/>- Total Users<br/>- Daily Active<br/>- Growth Rate"]
        USAGE["📈 Feature Usage<br/>- AI Doctor Calls<br/>- Marketplace Sales<br/>- Consultation Bookings"]
        HEALTH["💊 System Health<br/>- API Latency<br/>- Error Rates<br/>- AI Model Accuracy"]
    end

    subgraph "CONTENT MODERATION"
        ALERTS_MOD["🚨 Moderate Alerts<br/>- Spam Alerts<br/>- False Alerts<br/>- Offensive Content"]
        LISTINGS_MOD["🛒 Review Listings<br/>- Inappropriate Photos<br/>- Pricing Issues<br/>- Duplicate Listings"]
        FEEDBACK_MOD["⭐ Monitor Reviews<br/>- Offensive Language<br/>- Spam Reviews<br/>- Suspicious Patterns"]
    end

    subgraph "ENFORCEMENT"
        WARN["⚠️ Warning Message<br/>- Clarify Violation<br/>- Offer Resolution"]
        TEMP_BAN["🚫 Temporary Ban<br/>- 7-30 Days<br/>- Limited Features"]
        PERM_BAN["❌ Permanent Ban<br/>- Delete Account<br/>- Report to Authority"]
    end

    REG --> PENDING

    PENDING --> REVIEW --> DECISION
    DECISION -->|Officer| APPROVE
    DECISION -->|False Info| REJECT

    APPROVE --> ACTIVE
    ACTIVE --> MONITOR
    MONITOR --> SUSPEND

    FALSE_REP --> CHECKS
    CHECKS --> PENALIZE

    STATS --> USAGE
    USAGE --> HEALTH

    ALERTS_MOD --> WARN
    LISTINGS_MOD --> WARN
    FEEDBACK_MOD --> WARN

    WARN --> TEMP_BAN
    TEMP_BAN --> PERM_BAN

    style PENDING fill:#ffe0b2
    style APPROVE fill:#c8e6c9
    style REJECT fill:#ffcdd2
    style SUSPEND fill:#ffcdd2
    style STATS fill:#fff9c4
    style PERM_BAN fill:#c62828
```

---

## Key Integration Points

### 1. **Hub-Feature Cross-Integration**
- All 4 hubs share the same user context (credits, reputation, location)
- Navigation between hubs is seamless with data persistence
- Credits deducted apply globally across all hubs

### 2. **AI Service Integration**
- Only the backend calls the AI service (`src/services/aiClient.js`, `X-API-Key`); browsers never see it
- The photo is sent as-is; quality checks and preprocessing happen in the AI service
- Disease names, Sinhala names, descriptions and treatment steps come from the AI service's class catalogue (cached 10 minutes)
- Heatmaps (CAM) are returned with each diagnosis and not stored
- Photos of unknown diseases are stored as `UnknownCase` for officer review

### 3. **Credit System Integration**
- deducted pre-emptively before API calls
- Insufficient credits block requests at middleware
- Premium users have unlimited access
- Daily reset happens lazily on the first paid request of the day
- Credits are refunded when the AI service is down or no diagnosis is possible

### 4. **Database Schema Relationships**
```
User
├── savedListings → [Listing._id]
├── consultationSessions → [Session._id]
├── diseaseReports → [DiseaseReport._id]
├── feedback (received) → [Feedback._id]
└── alerts (created) → [Alert._id]

Listing
├── farmerId → User._id
├── images → [image_ids]
├── manualBookings → [ManualBooking._id]
└── feedback (on listing) → [Feedback._id]

Alert
├── createdBy → User._id (farmer/officer)
├── approvedBy → User._id (officer)
├── diseaseReport → DiseaseReport._id
└── affectedUsers → [User._id] (notified)

Session
├── instructorId → User._id (officer)
├── farmerId → User._id
├── slot → InstructorSlot._id
└── feedback → Feedback._id
```

### 5. **Notification Triggers**
- Disease Alert Approved → Send to affected district
- New Listing Created → Notify related buyers
- Session Booked → Confirm with both parties
- Feedback Received → Notify user
- Low Credits → Show purchase modal

---

## Document Information
- **Last Updated**: March 30, 2026
- **Scope**: Complete feature workflows and integrations
- **Status**: Fully Documented
- **Total Diagrams**: 13 comprehensive flows

