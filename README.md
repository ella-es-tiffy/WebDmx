# WebDmx

WebDmx is a **server-client** system designed to control DMX lighting fixtures through a web-based interface. The system leverages **WebSockets** to ensure real-time, low-latency communication between the browser client and the control server.

## Project Status
This software is currently in development and intended for **internal testing purposes only**. It serves as a lightweight proof-of-concept for remote DMX management.

## Technical Architecture
*   **Communication:** Real-time data transfer via WebSockets.
*   **Hardware Interface:** Designed for USB-to-DMX controllers based on the **FTDI chipset**.
*   **Platform Compatibility:** Verified on **macOS (Apple Silicon M1)**.

## Supported Hardware
While the software is built to be compatible with most standard FTDI-based devices, the following configuration has been specifically tested:
*   **Interface:** JMS USB2DMX
*   **Host:** macOS with M1 Chip
