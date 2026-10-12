#!/usr/bin/env python3
"""
Remove watermark from images by inpainting a specified region.
Default region: bottom right 10% of the image.
"""

import cv2
import numpy as np
import sys
import os

def remove_watermark(image_path, region=None, output_path=None):
    """
    Remove watermark from image by inpainting the specified region.
    
    Args:
        image_path (str): Path to input image.
        region (tuple): (x, y, width, height) of the watermark region.
                       If None, uses bottom right 10%.
        output_path (str): Path to save result. If None, overwrites input.
    """
    # Read image
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")
    
    h, w = img.shape[:2]
    
    # Default region: bottom right 10%
    if region is None:
        x = int(w * 0.9)
        y = int(h * 0.9)
        width = w - x
        height = h - y
        region = (x, y, width, height)
    
    x, y, width, height = region
    
    # Create mask
    mask = np.zeros((h, w), dtype=np.uint8)
    mask[y:y+height, x:x+width] = 255
    
    # Inpaint
    result = cv2.inpaint(img, mask, 3, cv2.INPAINT_TELEA)
    
    # Save
    if output_path is None:
        output_path = image_path
    cv2.imwrite(output_path, result)
    print(f"Watermark removed from {image_path} -> {output_path}")
    return output_path

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python remove_watermark.py <image_path> [region]")
        print("Region format: x,y,width,height (optional, default: bottom right 10%)")
        sys.exit(1)
    
    image_path = sys.argv[1]
    region = None
    if len(sys.argv) >= 3:
        try:
            region = tuple(map(int, sys.argv[2].split(',')))
            if len(region) != 4:
                raise ValueError
        except:
            print("Error: region must be four integers: x,y,width,height")
            sys.exit(1)
    
    remove_watermark(image_path, region)
