/**
 * ===========================================
 * AUTHENTICATION CONTROLLER
 * ===========================================
 */

const User = require('../models/User.model');
const { generateToken } = require('../middleware/auth.middleware');
const { QueueService } = require('../services/queue.service');

/**
 * REGISTER NEW USER
 * POST /api/v1/auth/register
 * 
 * LEARNING: Registration Flow
 * 
 * 1. Validate input (middleware)
 * 2. Check if user exists
 * 3. Create user (password auto-hashed by model)
 * 4. Generate JWT
 * 5. Queue welcome email (async)
 * 6. Return user + token
 */
const register = async (req, res, next) => {
  try {
    const { username, email, password, displayName } = req.body;
    
    // Check for existing user
    /**
     * LEARNING: $or Query
     * 
     * Matches documents where ANY condition is true
     * Equivalent to: email = X OR username = Y
     */
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });
    
    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'username';
      return res.status(400).json({
        success: false,
        message: `User with this ${field} already exists`
      });
    }
    
    // Create user
    const user = await User.create({
      username,
      email,
      password,
      displayName: displayName || username
    });
    
    // Generate JWT
    const token = generateToken(user._id);
    
    // Queue welcome email (async - don't wait)
    QueueService.sendWelcomeEmail(user._id, email, username)
      .catch(err => console.error('Failed to queue welcome email:', err));
    
    // Return success response
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: user.toPublicJSON(),
        token
      }
    });
    
  } catch (error) {
    /**
     * LEARNING: MongoDB Duplicate Key Error
     * 
     * Error code 11000: Duplicate key violation
     * Happens when unique constraint is violated
     */
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }
    next(error);
  }
};

/**
 * LOGIN USER
 * POST /api/v1/auth/login
 * 
 * LEARNING: Login Flow with Security
 * 
 * 1. Find user by email
 * 2. Compare password (bcrypt)
 * 3. Generate JWT
 * 4. Update last login time
 * 5. Return token
 * 
 * SECURITY NOTES:
 * - Don't reveal which field is wrong (email vs password)
 * - Rate limit login attempts (done via middleware)
 * - Log failed attempts for monitoring
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }
    
    /**
     * LEARNING: select('+password')
     * 
     * Remember: password has select: false in schema
     * Must explicitly include it for login
     */
    const user = await User.findOne({ email }).select('+password');
    
    // Generic error to not reveal which field is wrong
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated'
      });
    }
    
    // Compare password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Update last login
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });
    
    // Generate token
    const token = generateToken(user._id);
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toPublicJSON(),
        token
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * GET CURRENT USER
 * GET /api/v1/auth/me
 * 
 * Protected route - requires valid JWT
 */
const getMe = async (req, res, next) => {
  try {
    // req.user is set by protect middleware
    res.status(200).json({
      success: true,
      data: {
        user: req.user.toPublicJSON()
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * UPDATE USER PROFILE
 * PUT /api/v1/auth/profile
 */
const updateProfile = async (req, res, next) => {
  try {
    const { displayName, bio, avatar } = req.body;
    
    /**
     * LEARNING: Selective Update
     * 
     * Only update fields that are provided
     * $set: Only modifies specified fields
     * runValidators: Run schema validators on update
     */
    const updates = {};
    if (displayName !== undefined) updates.displayName = displayName;
    if (bio !== undefined) updates.bio = bio;
    if (avatar !== undefined) updates.avatar = avatar;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    
    // Invalidate user cache if using caching
    // CacheService.invalidateUserProfile(req.user._id);
    
    res.status(200).json({
      success: true,
      message: 'Profile updated',
      data: {
        user: user.toPublicJSON()
      }
    });
    
  } catch (error) {
    next(error);
  }
};

/**
 * CHANGE PASSWORD
 * PUT /api/v1/auth/password
 */
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }
    
    // Get user with password
    const user = await User.findById(req.user._id).select('+password');
    
    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Update password (will be hashed by pre-save hook)
    user.password = newPassword;
    await user.save();
    
    // Optionally: Invalidate all existing tokens
    // This would require storing tokens or using token versioning
    
    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
    
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  updateProfile,
  changePassword
};
