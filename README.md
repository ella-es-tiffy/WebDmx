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

## 🚀 Getting Started
Follow these steps to get the DMX Controller running on your machine.
### 🛠️ Hardware Requirements
*   **DMX Interface:** USB-DMX512 Interface (FTDI Chipset recommended, e.g., **Eurolite USB-DMX512 PRO**).
*   **Computer:** macOS or Windows machine.
*   **DMX Cabling & Lights.**

### 📦 Software Requirements
*   **Node.js:** You need Node.js installed to run the backend server.
    *   [Download Node.js (LTS Version)](https://nodejs.org/)
*   **Web Browser:** Chrome, Edge, or Safari (Modern browser required).

## 🔌 1. Driver Installation
Your computer needs to "talk" to the USB Interface properly.
### **macOS**
1.  **Plug in our Interface.**
2.  Usually, macOS installs the driver automatically.
3.  **If not detected:** Download and install the [FTDI VCP Driver for Mac](https://ftdichip.com/drivers/vcp-drivers/).
    *   *Note:* Go to **System Settings -> Privacy & Security** to allow the accessory to connect if prompted.

### **Windows**
1.  **Plug in your Interface.**
2.  Check Windows Update; it normally installs the FTDI driver automatically.
3.  **If not:** Download the **"setup executable"** from [FTDI VCP Drivers for Windows](https://ftdichip.com/drivers/vcp-drivers/).
---
## 📥 2. Installation
1.  **Download the Code:**
    Clone this repository:
    ```bash
    git clone [https://github.com/ella-es-tiffy/WebDmx.git](https://github.com/ella-es-tiffy/WebDmx.git)
    ```
    *(Or download the ZIP file and extract it).*
2.  **Install Backend Dependencies:**
    Open your Terminal (Mac) or Command Prompt/PowerShell (Windows).
    Navigate to the `backend` folder:
    ```bash
    cd backend
    ```
    Install required packages:
    ```bash
    npm install
    ```
---
## ▶️ 3. Running the Show
1.  **Connect your USB-DMX Interface.**
2.  **Start the Server:**
    Inside the `backend` folder, run:
    ```bash
    npm run dev
    ```
    *You should see a message confirming the server is running on port 3000 and the DMX interface is connected.*
3.  **Open the App:**
    The backend usually serves the app at: `http://localhost:3000`
---
## 🛑 Troubleshooting
### Common Errors
*   **"Serialport not found"**: Check if your USB cable is plugged in firmly and the FTDI drivers are installed.
*   **Permissions (Mac):** Ensure your Terminal app has permission to access USB accessories.
### 🔧 Configuration (Advanced)
If your DMX interface is not detected or behaves strangely (e.g., connected but no light), you can tweak the connection parameters.
**1. Change Port & Speed (Easy)**
Create a `.env` file in the `backend/` directory to override the defaults:
```env
# Example for Windows
DMX_PORT=COM3
DMX_BAUDRATE=250000
# Example for Mac/Linux
DMX_PORT=/dev/tty.usbserial-AL00F5
DMX_BAUDRATE=250000
