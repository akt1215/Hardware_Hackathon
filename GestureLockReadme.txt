# GestureLock

### Motion-Based Physical Authentication System

## Overview

GestureLock is a low-cost physical authentication system that replaces traditional passwords with unique hand gestures. Using an MPU6050 motion sensor, an STM32 microcontroller, and a servo motor, the system authenticates users based on predefined movement patterns before granting access to a protected physical device.

The project demonstrates how motion biometrics can be used as an alternative authentication factor for robotics, autonomous systems, industrial equipment, and access control applications.

---

## Problem Statement

Traditional authentication methods such as passwords and PINs can be forgotten, stolen, or observed. As connected devices, robots, and autonomous systems become more common, new forms of authentication are needed that are intuitive, secure, and difficult to replicate.

GestureLock addresses this challenge by using a user's physical movement as the authentication credential.

---

## Solution

GestureLock captures hand movements using an MPU6050 Inertial Measurement Unit (IMU). The STM32 microcontroller analyzes the movement data and compares it against a predefined gesture sequence.

If the gesture sequence matches the stored credential, a servo motor physically unlocks the system. If the gesture is incorrect, access is denied. After multiple failed attempts, the system enters a security lockout mode.

---

## Hardware Components

* STM32 NUCLEO-G474RE Development Board
* MPU6050 Accelerometer and Gyroscope Sensor
* SG90 Servo Motor
* Breadboard
* Jumper Wires
* USB Cable

---

## System Architecture

User Hand Gesture
↓
MPU6050 Motion Sensor
↓
STM32 Microcontroller
↓
Gesture Recognition Engine
↓
Authentication Decision
↓
Servo Lock / Unlock

---

## Features

* Motion-based authentication
* Password-free access control
* Real-time gesture recognition
* Physical lock and unlock mechanism
* Multiple failed-attempt protection
* Low-cost embedded security solution
* Portable and scalable design

---

## Authentication Workflow

1. User performs a predefined gesture sequence.
2. MPU6050 captures movement and orientation data.
3. STM32 analyzes the gesture pattern.
4. System compares the detected gesture against the stored credential.
5. If the sequence matches:

   * Access Granted
   * Servo unlocks
6. If the sequence does not match:

   * Access Denied
7. After three failed attempts:

   * System enters lockout mode

Default Gesture Password:

LEFT → RIGHT → UP

---

## Applications

* Smart Locks
* Physical Access Control
* Robotics Authentication
* Drone Activation Systems
* Industrial Equipment Security
* Autonomous System Access Management
* IoT Device Authentication

---

## Future Enhancements

* Machine Learning-Based Gesture Recognition
* User-Specific Gesture Profiles
* Mobile Application Integration
* Multi-Factor Authentication
* Cloud-Based Access Logging
* Bluetooth and Wi-Fi Connectivity
* Biometric Motion Signature Analysis

---

## Security Considerations

GestureLock uses behavioral authentication by validating how a user performs a specific movement sequence. Unlike traditional passwords, gestures are performed physically and can incorporate timing, direction, and motion characteristics, making them more difficult to observe and replicate.

---

## Team Contribution

* Embedded Systems Development
* Motion Sensor Integration
* Gesture Recognition Logic
* Servo Control Mechanism
* Security Architecture
* System Demonstration and Testing

---

## Conclusion

GestureLock demonstrates a practical and innovative approach to physical authentication using motion biometrics. By combining inertial sensing, embedded processing, and physical actuation, the system showcases how gesture-based authentication can enhance security for future connected and autonomous systems.
