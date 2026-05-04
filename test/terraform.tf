provider "aws" {
  region = "us-east-1"
}

# Bucket S3 público
resource "aws_s3_bucket" "insecure_bucket" {
  bucket = "meu-bucket-inseguro-123456"

  acl = "public-read"

  tags = {
    Name = "InsecureBucket"
  }
}

# Sem bloqueio de acesso público
resource "aws_s3_bucket_public_access_block" "bad_config" {
  bucket = aws_s3_bucket.insecure_bucket.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

# Security Group totalmente aberto
resource "aws_security_group" "open_sg" {
  name        = "open-sg"
  description = "Security group inseguro"

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"] # aberto pra internet inteira
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Instância EC2 insegura
resource "aws_instance" "insecure_ec2" {
  ami           = "ami-0c94855ba95c71c99" # AMI antiga
  instance_type = "t2.micro"

  associate_public_ip_address = true

  vpc_security_group_ids = [aws_security_group.open_sg.id]

  # User data com segredo hardcoded
  user_data = <<-EOF
              #!/bin/bash
              echo "DB_PASSWORD=123456" >> /etc/environment
              EOF

  tags = {
    Name = "InsecureInstance"
  }
}

# Banco RDS sem criptografia e público
resource "aws_db_instance" "insecure_db" {
  identifier        = "insecure-db"
  engine            = "mysql"
  instance_class    = "db.t3.micro"
  allocated_storage = 20

  username = "admin"
  password = "12345678" # senha fraca

  publicly_accessible = true
  skip_final_snapshot = true

  storage_encrypted = false

  backup_retention_period = 0

  tags = {
    Name = "InsecureDB"
  }
}

# IAM policy extremamente permissiva
resource "aws_iam_policy" "admin_policy" {
  name = "insecure-admin-policy"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "*"
        Resource = "*"
      }
    ]
  })
}