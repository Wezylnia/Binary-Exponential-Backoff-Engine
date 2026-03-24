# CSMA/CD Binary Exponential Backoff Simulator

A professional, high-fidelity web-based simulator for the **Carrier Sense Multiple Access with Collision Detection (CSMA/CD)** protocol, featuring the **Binary Exponential Backoff** algorithm.

This project is a 1:1 JavaScript port of the original C# simulation engine, designed to run entirely in the browser and ready for deployment to **GitHub Pages**.

## Live Demo
*(Once deployed, you can insert your GitHub Pages link here)*

## Features

- **Precise Algorithm Parity**: Built to match the exact logic, timing constants, and rounding behavior of the original C# `DynamicCsmaEngine`.
- **Dynamic Configuration**: Add/remove nodes, adjust frame sizes, and define custom backoff sequences via an intuitive UI.
- **High-Resolution Timeline**: An interactive Canvas-based visualization shows:
  - **TX (Transmission)**: Successful data transfers.
  - **Collision**: Simultaneous transmission detections.
  - **Jam Signal**: 3.2μs signals sent after collisions to ensure all nodes detect the clash.
  - **Backoff**: Waiting periods based on the Binary Exponential Backoff k-values.
  - **IFG (Inter-Frame Gap)**: The standard 9.6μs mandatory quiet time.
- **Interactive Tooltips**: Hover over any event on the timeline to see exact start/end times, durations, and notes.
- **Export to PNG**: Download the generated timeline for reports or documentation.
- **Zero Dependencies**: Pure HTML5, CSS3, and Vanilla JavaScript. No backend required.

## Project Structure

```text
CsmaCdWeb/
├── index.html        # Main entry point & Styling
├── js/
│   ├── simulation.js # The core ported algorithm (Logic)
│   └── ui.js         # Table management, Canvas rendering & UI logic
```

## Simulation Constants

The simulator uses standard Ethernet (10Mbps) timing constants:
- **Slot Time**: 51.2 μs
- **Inter-Frame Gap (IFG)**: 9.6 μs
- **Jam Signal Duration**: 3.2 μs
- **Collision Duration**: 51.2 μs (Two-Tau)
- **Propagation Delay (Tau)**: 25.6 μs
- **Bitrate**: 10.0 Mbps

## How to Use

1. **Add Nodes**: Use the "+ Yeni Cihaz" button to add network devices.
2. **Configure**: 
   - Set the **Frame Size** (in Bytes).
   - Enter **Backoff Multipliers** as a comma-separated list (e.g., `0, 1, 2, 4`). These are the `k` values where `WaitTime = k * SlotTime`.
3. **Run**: Click "Simülasyonu Çalıştır" to execute the algorithm.
4. **Analyze**: Scroll down to see the timeline. Hover over blocks to see details or export the result as an image.

## Technical Implementation Note

This simulator is specialized in handling "Late Joiners" — nodes that finish their backoff exactly during an existing collision window. It maintains a strict state machine for each node:
`IFG` → `TX/COLLISION` → `JAM` → `BACKOFF` → `WAITING` → `DONE`.

---
*Developed as a high-fidelity port for educational and analysis purposes.*
