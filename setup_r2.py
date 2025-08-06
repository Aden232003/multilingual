#!/usr/bin/env python3
"""
Setup script for Cloudflare R2 bucket
Run this after creating your R2 credentials
"""

import boto3
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# R2 Configuration
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.environ.get('R2_BUCKET_NAME', 'multilingual-video-workflow')
R2_ENDPOINT_URL = os.environ.get('R2_ENDPOINT_URL')

if not all([R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL]):
    print("❌ Missing R2 environment variables. Please set:")
    print("   R2_ACCESS_KEY_ID")
    print("   R2_SECRET_ACCESS_KEY") 
    print("   R2_ENDPOINT_URL")
    exit(1)

# Initialize R2 client
r2_client = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

def setup_bucket():
    """Create R2 bucket if it doesn't exist"""
    try:
        # Check if bucket exists
        r2_client.head_bucket(Bucket=R2_BUCKET_NAME)
        print(f"✅ Bucket '{R2_BUCKET_NAME}' already exists")
    except:
        try:
            # Create bucket
            r2_client.create_bucket(Bucket=R2_BUCKET_NAME)
            print(f"✅ Created bucket '{R2_BUCKET_NAME}'")
        except Exception as e:
            print(f"❌ Error creating bucket: {e}")
            return False
    
    try:
        # Set bucket policy for public read access (optional)
        bucket_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicReadGetObject",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": "s3:GetObject",
                    "Resource": f"arn:aws:s3:::{R2_BUCKET_NAME}/*"
                }
            ]
        }
        
        import json
        r2_client.put_bucket_policy(
            Bucket=R2_BUCKET_NAME,
            Policy=json.dumps(bucket_policy)
        )
        print(f"✅ Set public read policy for bucket")
        
    except Exception as e:
        print(f"⚠️  Could not set bucket policy (optional): {e}")
    
    return True

if __name__ == "__main__":
    print("🚀 Setting up Cloudflare R2 bucket...")
    if setup_bucket():
        print("✅ R2 setup complete!")
        print(f"📦 Bucket name: {R2_BUCKET_NAME}")
        print(f"🌐 Endpoint: {R2_ENDPOINT_URL}")
        print("\n📋 Next steps:")
        print("1. Set up custom domain for R2 bucket (optional but recommended)")
        print("2. Update R2_PUBLIC_URL environment variable")
        print("3. Deploy your application!")
    else:
        print("❌ R2 setup failed")