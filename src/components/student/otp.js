// Add notification styles to the page
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        opacity: 0;
        transform: translateY(-10px);
        transition: all 0.3s ease;
        z-index: 1000;
    }
    .notification.show {
        opacity: 1;
        transform: translateY(0);
    }
    .notification.success {
        background-color: #4caf50;
        box-shadow: 0 4px 12px rgba(76, 175, 80, 0.15);
    }
    .notification.error {
        background-color: #f44336;
        box-shadow: 0 4px 12px rgba(244, 67, 54, 0.15);
    }
`;
document.head.appendChild(style);

// Function to show notifications
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Trigger reflow for animation
    notification.offsetHeight;
    notification.classList.add('show');

    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Function to send OTP
async function sendOTP() {
    const emailInput = document.querySelector('input[type="email"]');
    const email = emailInput.value.trim();

    if (!email) {
        showNotification('Please enter your email address', 'error');
        return;
    }

    try {
        const response = await fetch('http://localhost:5502/api/send-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('OTP sent successfully', 'success');
        } else {
            showNotification(data.error || 'Failed to send OTP', 'error');
        }
    } catch (error) {
        showNotification('Failed to connect to server', 'error');
    }
}

// Function to verify OTP
async function verifyOTP(email) {
    const otpInputs = document.querySelectorAll('.otp-box');
    const otp = Array.from(otpInputs).map(input => input.value).join('');

    if (otp.length !== 6) {
        showNotification('Please enter the complete OTP', 'error');
        return false;
    }

    try {
        const response = await fetch('http://localhost:5502/api/verify-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, otp })
        });

        const data = await response.json();

        if (response.ok) {
            showNotification('OTP verified successfully', 'success');
            return true;
        } else {
            showNotification(data.error || 'Invalid OTP', 'error');
            return false;
        }
    } catch (error) {
        showNotification('Failed to verify OTP', 'error');
        return false;
    }
}

// Handle form submission
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const emailInput = document.querySelector('input[type="email"]');
    const email = emailInput.value.trim();

    const isVerified = await verifyOTP(email);
    if (!isVerified) {
        return;
    }

    // Proceed with registration
    showNotification('Registration successful!', 'success');
    // Add your registration logic here
});