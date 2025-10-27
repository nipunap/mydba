-- Test Database Schema and Sample Data for MyDBA Integration Tests
-- Creates realistic test data with various scenarios for testing

-- Drop tables if they exist
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;

-- Users table
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products table
CREATE TABLE products (
    id INT PRIMARY KEY AUTO_INCREMENT,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    stock_quantity INT NOT NULL DEFAULT 0,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_sku (sku),
    INDEX idx_category (category),
    INDEX idx_price (price),
    INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders table
CREATE TABLE orders (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
    total_amount DECIMAL(10,2) NOT NULL,
    shipping_address TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    shipped_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_order_number (order_number),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order items table
CREATE TABLE order_items (
    id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    INDEX idx_order_id (order_id),
    INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample users
INSERT INTO users (username, email, password_hash, first_name, last_name, status, created_at) VALUES
('john.doe', 'john.doe@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'John', 'Doe', 'active', NOW() - INTERVAL 365 DAY),
('jane.smith', 'jane.smith@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Jane', 'Smith', 'active', NOW() - INTERVAL 300 DAY),
('bob.wilson', 'bob.wilson@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Bob', 'Wilson', 'active', NOW() - INTERVAL 200 DAY),
('alice.brown', 'alice.brown@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Alice', 'Brown', 'active', NOW() - INTERVAL 150 DAY),
('charlie.davis', 'charlie.davis@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Charlie', 'Davis', 'inactive', NOW() - INTERVAL 100 DAY),
('emma.johnson', 'emma.johnson@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Emma', 'Johnson', 'active', NOW() - INTERVAL 50 DAY),
('david.lee', 'david.lee@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'David', 'Lee', 'suspended', NOW() - INTERVAL 30 DAY),
('sophia.garcia', 'sophia.garcia@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Sophia', 'Garcia', 'active', NOW() - INTERVAL 20 DAY),
('michael.martinez', 'michael.martinez@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Michael', 'Martinez', 'active', NOW() - INTERVAL 10 DAY),
('olivia.rodriguez', 'olivia.rodriguez@example.com', '$2a$10$abcdefghijklmnopqrstuv', 'Olivia', 'Rodriguez', 'active', NOW() - INTERVAL 5 DAY);

-- Insert sample products
INSERT INTO products (sku, name, description, price, stock_quantity, category, is_active) VALUES
('LAPTOP-001', 'Professional Laptop', 'High-performance laptop for professionals', 1299.99, 50, 'Electronics', TRUE),
('PHONE-001', 'Smartphone Pro', 'Latest smartphone with advanced features', 899.99, 100, 'Electronics', TRUE),
('TABLET-001', 'Tablet Premium', 'Premium tablet with stylus', 599.99, 75, 'Electronics', TRUE),
('HEADPHONE-001', 'Wireless Headphones', 'Noise-cancelling wireless headphones', 299.99, 150, 'Audio', TRUE),
('KEYBOARD-001', 'Mechanical Keyboard', 'RGB mechanical gaming keyboard', 149.99, 200, 'Accessories', TRUE),
('MOUSE-001', 'Gaming Mouse', 'High-precision gaming mouse', 79.99, 250, 'Accessories', TRUE),
('MONITOR-001', '4K Monitor', '27-inch 4K professional monitor', 499.99, 60, 'Electronics', TRUE),
('WEBCAM-001', 'HD Webcam', '1080p webcam with microphone', 89.99, 120, 'Electronics', TRUE),
('SPEAKER-001', 'Bluetooth Speaker', 'Portable bluetooth speaker', 59.99, 180, 'Audio', TRUE),
('CHARGER-001', 'Fast Charger', 'Universal fast charger', 29.99, 300, 'Accessories', TRUE),
('CASE-001', 'Laptop Case', 'Protective laptop case', 39.99, 150, 'Accessories', TRUE),
('CABLE-001', 'USB-C Cable', 'High-speed USB-C cable', 19.99, 500, 'Accessories', TRUE),
('STAND-001', 'Laptop Stand', 'Adjustable laptop stand', 49.99, 100, 'Accessories', TRUE),
('PAD-001', 'Mouse Pad', 'Extended gaming mouse pad', 24.99, 200, 'Accessories', TRUE),
('BAG-001', 'Laptop Bag', 'Professional laptop bag', 79.99, 80, 'Accessories', FALSE);

-- Insert sample orders
INSERT INTO orders (user_id, order_number, status, total_amount, shipping_address, created_at) VALUES
(1, 'ORD-2024-001', 'delivered', 1599.98, '123 Main St, New York, NY 10001', NOW() - INTERVAL 60 DAY),
(1, 'ORD-2024-002', 'delivered', 449.97, '123 Main St, New York, NY 10001', NOW() - INTERVAL 45 DAY),
(2, 'ORD-2024-003', 'delivered', 899.99, '456 Oak Ave, Los Angeles, CA 90001', NOW() - INTERVAL 40 DAY),
(2, 'ORD-2024-004', 'shipped', 679.98, '456 Oak Ave, Los Angeles, CA 90001', NOW() - INTERVAL 5 DAY),
(3, 'ORD-2024-005', 'processing', 299.99, '789 Pine Rd, Chicago, IL 60601', NOW() - INTERVAL 2 DAY),
(4, 'ORD-2024-006', 'delivered', 1799.96, '321 Elm St, Houston, TX 77001', NOW() - INTERVAL 30 DAY),
(6, 'ORD-2024-007', 'pending', 149.98, '654 Maple Dr, Phoenix, AZ 85001', NOW() - INTERVAL 1 DAY),
(8, 'ORD-2024-008', 'delivered', 599.99, '987 Birch Ln, Philadelphia, PA 19101', NOW() - INTERVAL 25 DAY),
(9, 'ORD-2024-009', 'processing', 229.97, '147 Cedar Ct, San Antonio, TX 78201', NOW() - INTERVAL 3 DAY),
(10, 'ORD-2024-010', 'pending', 89.99, '258 Willow Way, San Diego, CA 92101', NOW());

-- Insert order items
INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal) VALUES
-- Order 1
(1, 1, 1, 1299.99, 1299.99),
(1, 5, 2, 149.99, 299.99),
-- Order 2
(2, 4, 1, 299.99, 299.99),
(2, 9, 1, 59.99, 59.99),
(2, 12, 3, 19.99, 59.97),
-- Order 3
(3, 2, 1, 899.99, 899.99),
-- Order 4
(4, 3, 1, 599.99, 599.99),
(4, 10, 2, 29.99, 59.98),
(4, 14, 1, 24.99, 24.99),
-- Order 5
(5, 4, 1, 299.99, 299.99),
-- Order 6
(6, 1, 1, 1299.99, 1299.99),
(6, 7, 1, 499.99, 499.99),
-- Order 7
(7, 5, 1, 149.99, 149.99),
-- Order 8
(8, 3, 1, 599.99, 599.99),
-- Order 9
(9, 6, 1, 79.99, 79.99),
(9, 13, 3, 49.99, 149.97),
-- Order 10
(10, 8, 1, 89.99, 89.99);

-- Create a table without proper indexes for testing query optimization
CREATE TABLE unindexed_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    action VARCHAR(100),
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Insert sample log data
INSERT INTO unindexed_logs (user_id, action, details, ip_address) VALUES
(1, 'login', 'User logged in successfully', '192.168.1.100'),
(1, 'view_product', 'Viewed product LAPTOP-001', '192.168.1.100'),
(1, 'add_to_cart', 'Added product to cart', '192.168.1.100'),
(2, 'login', 'User logged in successfully', '192.168.1.101'),
(2, 'search', 'Searched for "headphones"', '192.168.1.101'),
(3, 'login', 'User logged in successfully', '192.168.1.102'),
(3, 'view_product', 'Viewed product PHONE-001', '192.168.1.102');

-- Grant necessary permissions for test user
-- GRANT ALL PRIVILEGES ON test_db.* TO 'test_user'@'%';
-- FLUSH PRIVILEGES;

-- Show table statistics
SELECT 'Sample data loaded successfully!' AS status;
SELECT 'Users' AS table_name, COUNT(*) AS row_count FROM users
UNION ALL
SELECT 'Products', COUNT(*) FROM products
UNION ALL
SELECT 'Orders', COUNT(*) FROM orders
UNION ALL
SELECT 'Order Items', COUNT(*) FROM order_items
UNION ALL
SELECT 'Unindexed Logs', COUNT(*) FROM unindexed_logs;
