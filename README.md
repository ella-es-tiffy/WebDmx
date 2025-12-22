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
