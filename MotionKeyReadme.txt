# KineticAuth

## Motion-Based Physical Authentication System

KineticAuth is a physical authentication system that uses hand movement as a security credential. Instead of using a password or PIN, the user performs a unique motion pattern. The MPU6050 gyroscope detects the motion, the STM32 board verifies the gesture sequence, and the servo motor unlocks the system if the gesture is correct.

## Project Tagline

Your movement becomes your identity.

## Hardware Used

- STM32 Nucleo board
- MPU6050 gyroscope sensor
- SG90 servo motor
- Breadboard
- Jumper wires
- USB cable
- Laptop with Arduino IDE

## Default Gesture Password

LEFT → RIGHT → UP

## How It Works

1. User performs a hand gesture.
2. MPU6050 reads gyroscope movement.
3. STM32 detects gesture direction.
4. System compares the detected sequence with the saved password.
5. If correct, servo unlocks.
6. If incorrect, access is denied.
7. After 3 failed attempts, system enters lockout mode.

## System Flow

User Hand Motion  
↓  
MPU6050 Gyroscope  
↓  
STM32 Microcontroller  
↓  
Gesture Authentication Logic  
↓  
Servo Lock/Unlock Mechanism  

## Wiring

### MPU6050

| MPU6050 | STM32 |
|---|---|
| VCC | 3.3V |
| GND | GND |
| SDA | SDA |
| SCL | SCL |

### Servo

| Servo Wire | STM32 |
|---|---|
| Red | 5V |
| Brown/Black | GND |
| Orange/Yellow | D9 |

## Features

- Gesture-based authentication
- Physical lock/unlock mechanism
- Gyroscope-based motion detection
- Three-failed-attempt lockout
- Simple embedded security prototype
- Low-cost hardware implementation

## Real-World Applications

- Smart locks
- Robotics access control
- Drone activation systems
- Secure workstations
- Industrial machine authentication
- Autonomous system security
- IoT device protection

## Demo Script

KineticAuth demonstrates a future authentication method where physical motion becomes the password. The user performs the gesture LEFT → RIGHT → UP. If the motion matches the stored credential, the servo unlocks. If the gesture is wrong, the system denies access. After three failed attempts, the system locks out for security.

## Future Improvements

- Machine learning gesture recognition
- User-specific motion profiles
- Bluetooth or Wi-Fi authentication
- Mobile app integration
- Encrypted gesture storage
- Multi-factor authentication
- Access logging dashboard

## One-Line Pitch

KineticAuth turns hand movement into a secure physical credential for unlocking devices, robots, and autonomous systems.