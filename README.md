# WebDmx

WebDmx is a **server-client** system designed to control DMX lighting fixtures through a web-based interface. The system leverages **WebSockets** to ensure real-time, low-latency communication between the browser client and the control server.

## Project Status
This software is currently in development and intended for **internal testing purposes only**. It serves as a lightweight proof-of-concept for remote DMX management.

## Key Features
- **Fixture Management:** Effortlessly patch and manage your lighting rig.
- **Programmer:** Direct control and live manipulation of fixture attributes.
- **Stage Map:** Visual 2D representation for spatial fixture placement and selection.
- **Fixture Templates:** Support for custom and pre-defined fixture profiles.
- **Scene & Cue List:** Organize and play back complex lighting sequences.
- **DAW-Style Cue Editor:** A timeline-based editor for precise, visual cue timing and sequencing.
- **DMX Channel Monitor:** Real-time feedback of all 512 DMX channels in the universe.
- **Fixture Grouping:** Organize multiple fixtures into logical groups for faster programming.


## Technical Architecture
*   **Communication:** Real-time data transfer via WebSockets.
*   **Hardware Interface:** Designed for USB-to-DMX controllers based on the **FTDI chipset**.
*   **Platform Compatibility:** Verified on **macOS (Apple Silicon M1)**.

## Supported Hardware
While the software is built to be compatible with most standard FTDI-based devices, the following configuration has been specifically tested:
*   **Interface:** JMS USB2DMX
*   **Host:** macOS with M1 Chip

  


<img width="1849" height="1082" alt="Bildschirmfoto 2025-12-23 um 11 17 12" src="https://github.com/user-attachments/assets/f1157249-d34b-4d2d-93d7-422fbe9e06d2" />

<img width="1849" height="1082" alt="Bildschirmfoto 2025-12-23 um 11 18 25" src="https://github.com/user-attachments/assets/12ab86bb-ffef-491c-9c62-2cb42e50ff86" />

<img width="1849" height="1082" alt="Bildschirmfoto 2025-12-23 um 11 21 18" src="https://github.com/user-attachments/assets/3f79134c-167c-4da0-a6ad-3e55ef174190" />

